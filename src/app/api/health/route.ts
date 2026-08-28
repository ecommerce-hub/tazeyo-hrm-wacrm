export function GET() {
  const ts = new Date().toISOString()
  // Three different output channels to diagnose which one CloudWatch captures
  console.log('[health] console.log ping', ts)
  console.error('[health] console.error ping', ts)
  process.stdout.write(`[health] stdout.write ping ${ts}\n`)
  return Response.json({ status: 'ok', ts })
}
