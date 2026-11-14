/** Encyclopaedia entries each tutorial lesson points to, by lesson id (see Tutorial.tsx). */
export const LESSON_CODEX: Record<string, string[]> = {
  welcome: ['guide:welcome'],
  order: ['order:members', 'order:cells'],
  recruit: ['op:recruit', 'order:forecast'],
  time: ['guide:time'],
  veil: ['guide:veil'],
  seat: ['op:win-seat', 'world:offices'],
  lever: ['order:levers', 'order:influence'],
  op: ['order:operations', 'op:scout'],
  shadow: ['shadow:suspicion', 'shadow:inquiries'],
  conclave: ['order:conclave', 'order:posture'],
  work: ['guide:winning', 'order:creed'],
  end: ['guide:first-steps', 'guide:screens'],
};
