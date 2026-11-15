/**
 * The Great Work ends the campaign: once it is done and held, the Order wins and the creed
 * is judged, with no road beyond the walls after it. The work itself takes decades, so
 * here worksWeek reports it complete on the first week.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/city/order/works', async (orig) => ({ ...(await orig<typeof import('../src/city/order/works')>()), worksWeek: () => true }));

const { newBotCampaign, advance } = await import('../src/city/order/bot');

describe('the Great Work', () => {
  it('ends the campaign in a win, with the creed judged', () => {
    const k = newBotCampaign(3);
    advance(k, 14);
    const e = k.order.ending;
    expect(k.order.phase).toBe('ended');
    expect(e?.kind).toBe('won');
    expect(['true', 'changed', 'hollow']).toContain(e?.verdict);
    expect(e?.title).toMatch(/achieves its Great Work/);
    expect(e?.chronicle.join(' ')).not.toMatch(/beyond the walls/);
  });
});
