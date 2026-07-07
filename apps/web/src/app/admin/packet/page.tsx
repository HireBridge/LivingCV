export default function PacketPage() {
  return (
    <div>
      <h1>Career packet</h1>
      <p>
        The career packet (curated bio + project summary) lives inside your jobops
        instance. Phase 2 wires this page to <code>get_career_packet</code> /
        <code> update_career_packet</code> against jobops's authenticated /mcp
        mount, plus a link to jobops's own dashboard.
      </p>
      <p>
        For now, configure the jobops URL + token in{' '}
        <a href="/admin/settings">Settings</a>; the orchestrator service will read
        them when it spins up in Phase 2.
      </p>
    </div>
  );
}
