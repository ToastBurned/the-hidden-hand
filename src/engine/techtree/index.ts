/** All generated technologies, in id order (after the 30 core techs). */
import type { GenTech } from './schema';
import { SUBSISTENCE } from './data/subsistence';
import { MATERIALS } from './data/materials';
import { CRAFT } from './data/craft';
import { BUILDING } from './data/building';
import { TRANSPORT } from './data/transport';
import { MILITARY } from './data/military';
import { HEALTH } from './data/health';
import { KNOWLEDGE } from './data/knowledge';
import { SOCIETY } from './data/society';
import { ENERGY } from './data/energy';
import { EXTRA } from './data/extra';

export const GENERATED: GenTech[] = [...SUBSISTENCE, ...MATERIALS, ...CRAFT, ...BUILDING, ...TRANSPORT, ...MILITARY, ...HEALTH, ...KNOWLEDGE, ...SOCIETY, ...ENERGY, ...EXTRA];
