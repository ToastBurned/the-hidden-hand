import { describe, expect, it } from 'vitest';
import { newBotCampaign } from '../src/city/order/bot';
import { HandGame } from '../src/ui/hand/store';

describe('one-city game store', () => {
  it('runs the clock, takes commands and refreshes the view', () => {
    const g = new HandGame(newBotCampaign(2, 0));
    const day = g.view.day;
    let seen = 0;
    const off = g.subscribe(() => { seen++; });
    g.advance(28);
    expect(g.view.day).toBeGreaterThanOrEqual(day + 28);
    const agent = g.view.members.find((m) => m.canDo.includes('scout'))!;
    const r = g.command({ type: 'operation', kind: 'scout', agent: agent.id, target: { kind: 'district', id: g.k.city.districts[0].id }, approach: 'as a customer' });
    expect(r.ok).toBe(true);
    expect(g.view.operations.some((o) => o.kind === 'scout' && o.status === 'running')).toBe(true);
    expect(g.command({ type: 'posture', posture: 'cautious' }).ok).toBe(true);
    expect(g.view.order.posture).toBe('cautious');
    expect(seen).toBeGreaterThanOrEqual(3);
    off();
    g.dispose();
  });
});
