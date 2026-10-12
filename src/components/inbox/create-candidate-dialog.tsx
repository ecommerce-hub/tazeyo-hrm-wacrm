"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { toast } from "sonner";
import type { Contact } from "@/types";
import { CV_ALLOWED_EXTENSIONS, CV_MAX_BYTES, cvFilename } from "@/lib/hrm/cv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Transfers the conversation's contact into Tazeyo HRM as a candidate.
// Store + staff-request options come from /api/hrm/options (proxied —
// the browser never talks to the HRM origin); submission goes through
// /api/hrm/candidates, which reads the phone off the contact row
// server-side. The HRM enforces a globally unique phone: a duplicate
// comes back as 409 with the existing candidate, which we surface and
// still record on the contact.
//
// A CV can ride along, from either of two sources: a document the
// contact already sent in this conversation (the common case — CVs
// arrive over WhatsApp) or a file the agent picks from disk. The file
// wins when both are set.

interface HrmStore {
  id: number;
  name: string;
}

interface HrmStaffRequest {
  id: number;
  store_id: number;
  store_name: string;
  position_title: string;
  headcount: number;
}

/** A document message from the open conversation, offered as a CV source. */
export interface ChatDocument {
  id: string;
  filename: string;
  created_at: string;
}

const NONE = "__none__";

/** Server-side CV failure codes mapped to translatable messages; any
 *  other `error` string is shown as-is (e.g. the HRM's own Turkish). */
const CV_ERROR_KEYS = new Set([
  "cv_too_large",
  "cv_type_not_allowed",
  "cv_media_expired",
  "cv_fetch_failed",
]);

/** Split a free-text contact name into HRM's required first/last pair:
 *  the last word becomes the surname, the rest the first name(s). */
export function splitContactName(name: string | undefined): {
  first: string;
  last: string;
} {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return {
    first: parts.slice(0, -1).join(" "),
    last: parts[parts.length - 1],
  };
}

export function CreateCandidateDialog({
  open,
  onOpenChange,
  contact,
  documents,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact;
  documents: ChatDocument[];
  /** Fired when the contact got linked to an HRM candidate — on a
   *  fresh create AND on a duplicate-phone 409 (the server stamps the
   *  contact in both cases). */
  onCreated: (contactId: string, candidateId: number) => void;
}) {
  const t = useTranslations("Inbox.createCandidate");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [storeId, setStoreId] = useState<string>(NONE);
  const [staffRequestId, setStaffRequestId] = useState<string>(NONE);
  const [notes, setNotes] = useState("");
  const [cvMessageId, setCvMessageId] = useState<string>(NONE);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const cvFileInputRef = useRef<HTMLInputElement>(null);

  const [stores, setStores] = useState<HrmStore[]>([]);
  const [staffRequests, setStaffRequests] = useState<HrmStaffRequest[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const cvError = useCallback(
    (code: string | number) =>
      CV_ERROR_KEYS.has(String(code))
        ? t(`cvErrors.${String(code)}`)
        : String(code),
    [t],
  );

  // (Re)seed the form each time the dialog opens — the thread reuses one
  // dialog instance across contacts.
  useEffect(() => {
    if (!open) return;
    const { first, last } = splitContactName(contact.name);
    setFirstName(first);
    setLastName(last);
    setStoreId(NONE);
    setStaffRequestId(NONE);
    setNotes("");
    setCvMessageId(NONE);
    setCvFile(null);
    if (cvFileInputRef.current) cvFileInputRef.current.value = "";
    setNotConfigured(false);

    let cancelled = false;
    setOptionsLoading(true);
    fetch("/api/hrm/options")
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 503) setNotConfigured(true);
          else toast.error(t("toasts.optionsFailed", { reason: body?.error ?? res.status }));
          return;
        }
        setStores(body?.options?.stores ?? []);
        setStaffRequests(body?.options?.staff_requests ?? []);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("toasts.optionsFailed", { reason: "network" }));
      })
      .finally(() => {
        if (!cancelled) setOptionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contact.id]);

  const visibleRequests = useMemo(
    () =>
      storeId === NONE
        ? staffRequests
        : staffRequests.filter((r) => String(r.store_id) === storeId),
    [staffRequests, storeId],
  );

  // Each Select gets its options as `items` on the root too — that's what
  // lets Base UI's <Select.Value> render the item's LABEL in the closed
  // trigger; without it the trigger shows the raw value (“__none__”).
  const storeItems = useMemo(
    () => [
      { value: NONE, label: t("noStore") },
      ...stores.map((s) => ({ value: String(s.id), label: s.name })),
    ],
    [stores, t],
  );
  const requestItems = useMemo(
    () => [
      { value: NONE, label: t("noStaffRequest") },
      ...visibleRequests.map((r) => ({
        value: String(r.id),
        label: `${r.store_name} — ${r.position_title}`,
      })),
    ],
    [visibleRequests, t],
  );
  const cvItems = useMemo(
    () => [
      { value: NONE, label: t("noCv") },
      ...documents.map((d) => ({
        value: d.id,
        label: `${d.filename} · ${format(new Date(d.created_at), "d MMM HH:mm")}`,
      })),
    ],
    [documents, t],
  );

  const handleStoreChange = useCallback(
    (raw: string | null) => {
      const value = raw ?? NONE;
      setStoreId(value);
      // Drop a staff request that belongs to another store.
      setStaffRequestId((prev) => {
        if (prev === NONE || value === NONE) return prev;
        const req = staffRequests.find((r) => String(r.id) === prev);
        return req && String(req.store_id) === value ? prev : NONE;
      });
    },
    [staffRequests],
  );

  const handleRequestChange = useCallback(
    (raw: string | null) => {
      const value = raw ?? NONE;
      setStaffRequestId(value);
      // A staff request implies its store — mirror it into the store
      // select so the HRM notification reaches that store's managers.
      if (value !== NONE) {
        const req = staffRequests.find((r) => String(r.id) === value);
        if (req) setStoreId(String(req.store_id));
      }
    },
    [staffRequests],
  );

  const handleCvFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      if (!file) {
        setCvFile(null);
        return;
      }
      if (file.size > CV_MAX_BYTES) {
        toast.error(t("cvErrors.cv_too_large"));
        e.target.value = "";
        setCvFile(null);
        return;
      }
      if (!cvFilename(file.name, file.type)) {
        toast.error(t("cvErrors.cv_type_not_allowed"));
        e.target.value = "";
        setCvFile(null);
        return;
      }
      setCvFile(file);
      // The picked file wins over a chat document.
      setCvMessageId(NONE);
    },
    [t],
  );

  const canSubmit =
    !submitting &&
    !notConfigured &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("contact_id", contact.id);
      form.append("first_name", firstName.trim());
      form.append("last_name", lastName.trim());
      if (storeId !== NONE) form.append("store_id", storeId);
      if (staffRequestId !== NONE) form.append("staff_request_id", staffRequestId);
      if (notes.trim()) form.append("hr_notes", notes.trim());
      if (cvFile) form.append("cv_file", cvFile);
      else if (cvMessageId !== NONE) form.append("cv_message_id", cvMessageId);

      const res = await fetch("/api/hrm/candidates", {
        method: "POST",
        body: form,
      });
      const body = await res.json().catch(() => null);

      if (res.status === 201 && body?.candidate) {
        toast.success(
          t("toasts.created", { name: `${firstName.trim()} ${lastName.trim()}` }),
          body.candidate.hrm_url
            ? {
                action: {
                  label: t("openInHrm"),
                  onClick: () =>
                    window.open(body.candidate.hrm_url, "_blank", "noopener"),
                },
              }
            : undefined,
        );
        if (body.cv_error) {
          toast.warning(t("toasts.cvFailed", { reason: cvError(body.cv_error) }));
        }
        onCreated(contact.id, body.candidate.id);
        onOpenChange(false);
        return;
      }

      if (res.status === 409 && body?.candidate?.id) {
        // Already an HRM candidate — the server linked the contact; show
        // the HRM's own message (it names the existing candidate).
        toast.info(body.error);
        onCreated(contact.id, body.candidate.id);
        onOpenChange(false);
        return;
      }

      toast.error(
        t("toasts.failed", { reason: cvError(body?.error ?? res.status) }),
      );
    } catch {
      toast.error(t("toasts.failed", { reason: "network" }));
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    contact.id,
    firstName,
    lastName,
    storeId,
    staffRequestId,
    notes,
    cvFile,
    cvMessageId,
    cvError,
    onCreated,
    onOpenChange,
    t,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {notConfigured ? (
          <p className="text-sm text-muted-foreground">{t("notConfigured")}</p>
        ) : (
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  {t("firstName")}
                </label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  {t("lastName")}
                </label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                {t("phone")}
              </label>
              <Input value={contact.phone} readOnly disabled />
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                {t("store")}
              </label>
              <Select items={storeItems} value={storeId} onValueChange={handleStoreChange}>
                <SelectTrigger className="w-full" disabled={optionsLoading}>
                  <SelectValue placeholder={t("noStore")} />
                </SelectTrigger>
                <SelectContent>
                  {storeItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                {t("staffRequest")}
              </label>
              <Select items={requestItems} value={staffRequestId} onValueChange={handleRequestChange}>
                <SelectTrigger className="w-full" disabled={optionsLoading}>
                  <SelectValue placeholder={t("noStaffRequest")} />
                </SelectTrigger>
                <SelectContent>
                  {requestItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {staffRequestId === NONE
                  ? t("poolHint")
                  : t("newCandidateHint")}
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                {t("cv")}
              </label>
              <Select
                items={cvItems}
                value={cvMessageId}
                onValueChange={(raw) => {
                  const value = raw ?? NONE;
                  setCvMessageId(value);
                  // A chat document wins over a previously picked file.
                  if (value !== NONE) {
                    setCvFile(null);
                    if (cvFileInputRef.current) cvFileInputRef.current.value = "";
                  }
                }}
              >
                <SelectTrigger className="w-full" disabled={!!cvFile}>
                  <SelectValue placeholder={t("noCv")} />
                </SelectTrigger>
                <SelectContent>
                  {cvItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {documents.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("noChatDocuments")}
                </p>
              )}
              <label className="mt-2 block text-xs text-muted-foreground">
                {t("cvUpload")}
              </label>
              <Input
                ref={cvFileInputRef}
                type="file"
                accept={CV_ALLOWED_EXTENSIONS.join(",")}
                onChange={handleCvFileChange}
                className="mt-1 h-auto py-1.5 text-xs file:mr-2 file:text-xs"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                {t("notes")}
              </label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder={t("notesPlaceholder")}
              />
            </div>
          </div>
        )}

        <DialogFooter showCloseButton>
          {!notConfigured && (
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {submitting ? t("creating") : t("create")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
