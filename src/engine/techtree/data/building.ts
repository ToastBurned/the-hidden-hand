import { rows } from '../schema';

export const BUILDING = rows('building', `
longhouse|Longhouses|1|agriculture|~forest|am2 lo1|Large timber houses for extended families.
wattle_daub|Wattle and daub|1|-|-|bc4|Woven walls plastered with clay.
rammed_earth|Rammed earth|1|-|~arid|bc4|Compacted earth walls.
stilt_houses|Stilt houses|1|-|~marsh ~jungle|am2 di2|Raised homes above floods and damp.
igloo|Snow houses|0|-|@cold|am2|Shelters cut from snow.
yurt|Felt tents|2|felt|~grass|tr2 am1|Portable homes for herders.
megaliths|Megaliths|1|quarrying|+pi|lo2 rt3|Standing stones mark sacred places.
ziggurat|Stepped temples|2|masonry,fired_bricks|+pi +hi|lo3|Monumental temple mounds.
pyramids|Pyramids|2|masonry,counting_board|+pi +hi $1.4|lo3 ad2|Vast royal tombs organise labour.
corbel_vault|Corbelled vaults|2|masonry|-|bc2|Overlapping stones roof chambers.
post_lintel|Post and lintel|2|masonry|#arch|bc3 lu2|Columned halls.
true_arch|The arch|3|masonry,mortar|#arch|bc6|Arches span wide openings.
dome|Domes|3|true_arch,concrete|-|bc3 lu3|Masonry domes over great halls.
timber_frame|Timber framing|3|carpentry,joinery|~forest #arch|bc5|Framed houses of oak.
roof_tiles|Roof tiles|2|fired_bricks|-|bc2 di1|Fireproof roofs.
cranes|Treadwheel cranes|3|engineering,pulleys|-|bc6|Lifting heavy stone.
pulleys|Pulleys|3|wheel,cordage|-|bc3 cr2|Compound pulleys multiply force.
town_planning|Town planning|3|mathematics|+hi|di3 ad2|Grid streets and zoning.
paved_streets|Paved streets|3|engineering|!city|di2 tr3|Stone streets drain and carry traffic.
sewers|Sewers|3|sanitation|!city|di6|Covered drains carry away waste.
public_baths|Public baths|3|sanitation,concrete|-|di3 lu2|Bathing for all citizens.
hypocaust|Underfloor heating|3|concrete|~cold|am2|Heated floors.
amphitheatre|Amphitheatres|3|true_arch|-|lo3|Spectacle keeps the crowd content.
lighthouse|Lighthouses|3|masonry,sailing|@coast|se6|Beacons guide ships to harbour.
harbours|Harbours|3|engineering,sailing|@coast|tr4 se4|Moles and quays shelter ships.
dams|Dams|3|engineering|@river|fy4|Reservoirs regulate rivers.
bridges_stone|Stone bridges|3|true_arch,engineering|~river|tr5|Permanent river crossings.
granary_arch|Ventilated granaries|3|masonry|!food|sp6|Raised stores keep grain dry.
castles|Castles|4|masonry,fortification|+mi +hi|we4 lo3|Stone strongholds dominate the land.
gothic|Ribbed vaults|4|true_arch,geometry|+pi|bc4 lu3|Tall, light-filled stone buildings.
flying_buttress|Flying buttresses|4|gothic|-|bc3|External supports allow great windows.
cathedrals|Cathedrals|4|flying_buttress|+pi $1.3|lo3 rt2|Generations-long monuments of faith.
chimneys|Chimneys|4|fired_bricks|~cold|am3 di2|Smoke carried out of homes.
glazed_houses|Glazed houses|5|window_glass,chimneys|-|am2|Light, dry, warm homes.
star_fort|Bastion forts|5|gunpowder_artillery,geometry|+mi|we5|Angled bastions resist cannon.
urban_water|Municipal water|5|sanitation,water_power|!city|di6|Piped water from reservoirs.
cast_iron_bridge|Cast iron bridges|6|cast_iron,bridges_stone|-|tr4|Iron spans across rivers.
canal_locks|Canal locks|5|engineering,water_power|~river|tr6|Locks lift boats between levels.
terraced_housing|Terraced housing|6|fired_bricks,town_planning|!city|bc4|Dense, cheap urban housing.
gas_lighting|Gas lighting|7|coal_gas|-|lo3 re1|Lit streets and workshops.
coal_gas|Coal gas|7|coke|-|cr2|Gas distilled from coal.
steel_frame|Steel-frame buildings|8|bessemer,elevator|-|bc8|Tall buildings on steel skeletons.
elevator|Safety elevator|7|steam_engine,machine_tools|-|bc3|Lifts that cannot fall.
skyscraper|Skyscrapers|8|steel_frame,reinforced_concrete|!city|bc5 ad2|Cities grow upward.
modern_sewerage|Sewage treatment|8|germ_theory,urban_water|!city|di15 im6|Treated sewage, clean rivers.
water_chlorination|Water chlorination|8|bleaching,germ_theory|-|di12 im6|Chlorine kills waterborne disease.
central_heating|Central heating|7|steam_engine,cast_iron|~cold|am3|Radiators heat whole buildings.
suspension_bridge|Suspension bridges|7|wire_drawing,bessemer|-|tr5|Cables span great gaps.
tunnelling|Tunnelling shield|7|steam_engine,explosives_mining|-|tr4 bc2|Tunnels under rivers and mountains.
urban_transit|Urban transit|8|electric_tram|!city|tr4 lo1|Mass transit within cities.
slum_clearance|Housing reform|8|public_health|-|di6 im3|Building standards end the worst slums.
zoning_law|Building codes|7|town_planning,bureaucracy_tech|-|di3 lo1|Rules for safe construction.
fire_brigades|Fire brigades|6|town_planning|!city|lo2 am1|Organised firefighting.
fire_insurance|Fire insurance|6|insurance,fire_brigades|-|te2 lo1|Risk shared across owners.
`);
