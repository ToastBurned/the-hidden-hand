import { rows } from '../schema';

export const MATERIALS = rows('materials', `
ground_stone|Ground stone tools|1|knapping|~stone|tq3 wo4|Polished axes fell trees.
quarrying|Quarrying|1|ground_stone|@stone|bc4 mi3|Extracting building stone.
flint_mining|Flint mining|1|knapping|~stone|tq2 mi3|Shafts dug for high-quality flint.
lime_burning|Lime burning|1|fire_mastery|~stone|bc3|Burnt lime for plaster and mortar.
fired_clay|Fired clay figures|1|fire_mastery|+pi|lu2|Kiln-hardened clay.
kilns|Updraft kilns|1|pottery|-|cr3 sp2|Hotter, controlled firing.
pottery_wheel|Potter's wheel|2|pottery,wheel|-|cr4 sp3|Fast, even vessels.
glazes|Glazes|2|kilns|-|lu4 sp2|Glassy coatings seal pots.
native_copper|Cold-hammered copper|1|-|@copper|tq2 lu2|Beating native copper into ornaments.
gold_working|Goldsmithing|2|native_copper|@gold|lu8|Gold and silver ornaments.
silver_cupellation|Cupellation|3|gold_working,lead_smelting|@gold|lu5 te2|Refining silver from lead.
lead_smelting|Lead smelting|2|copper|-|mi2 cr2|Soft metal for pipes and weights.
tin_trade|Tin prospecting|2|copper|!trade|mi3 te2|Seeking tin for alloys.
arsenic_bronze|Arsenical bronze|2|copper|#alloy|tq3 we3|Copper alloyed with arsenic.
lost_wax|Lost-wax casting|2|bronze|-|lu5 cr3|Intricate cast metalwork.
bronze_tools|Bronze tools|2|bronze|-|tq3 wo5 fy2|Axes, sickles and saws of bronze.
mining_shafts|Mine shafts|2|copper|@hills|mi6|Galleries follow ore underground.
fire_setting|Fire-setting|2|mining_shafts|-|mi4|Heating rock to crack it.
ore_washing|Ore washing|2|mining_shafts|~river|mi4|Separating ore with water.
bloomery|Bloomery|3|iron|-|tq3 mi3|Small furnaces yield workable iron.
smithing|Blacksmithing|3|bloomery|-|tq4 cr4|Forging iron tools.
quenching|Quench hardening|3|smithing|-|tq3 we3|Plunging hot steel hardens it.
iron_tools|Iron tools|3|smithing|-|tq3 wo6 fy4|Cheap, strong tools for all.
wootz|Crucible steel|4|steel|#steelproc|tq4 we5 lu3|Patterned steel from sealed crucibles.
pattern_welding|Pattern welding|4|smithing|#steelproc|we4 lu2|Laminated blades.
brass|Brass|4|bronze,zinc_smelting|-|lu3 cr2|Copper-zinc alloy for instruments and coin.
zinc_smelting|Zinc smelting|4|bronze|-|mi2|Distilling zinc from ore.
mercury|Mercury refining|4|alchemy|-|mi3 lu2|Quicksilver for gilding and amalgamation.
amalgamation|Amalgamation|5|mercury,silver_cupellation|@gold|mi8 lu3|Extracting silver with mercury.
blast_furnace|Blast furnace|5|bloomery,water_power|-|mi10 tq4|Tall furnaces produce cast iron in bulk.
cast_iron|Cast iron|4|bloomery|-|cr3 bc3|Molten iron poured into moulds.
finery_forge|Finery forge|5|blast_furnace|-|tq3 cr3|Converting pig iron to wrought iron.
tinplate|Tinplate|5|finery_forge|-|cr3 sp3|Tin-coated iron sheet.
wire_drawing|Wire drawing|5|smithing,water_power|-|cr3|Pulling metal through dies.
coal_mining|Coal mining|5|mining_shafts|~hills|mi8|Coal for heat and smelting.
coke|Coke smelting|6|coal_mining,blast_furnace|-|mi10 bc3|Smelting iron with coked coal.
puddling|Puddling|6|coke|-|tq4 cr5|Stirred furnaces make wrought iron in bulk.
crucible_steel_cast|Cast steel|6|puddling|-|tq4 we4|Sheffield crucible steel for tools.
mine_drainage|Mine drainage pumps|6|steam_engine,coal_mining|-|mi12|Pumping deep mines dry.
bessemer|Bessemer process|7|puddling,chemistry|big|tq6 cr8 bc6|Cheap steel by blowing air through iron.
open_hearth|Open-hearth steel|7|bessemer|-|tq3 cr4|Regenerative furnaces for quality steel.
aluminium|Aluminium|8|electrolysis|-|cr4 tr3|Light metal by electrolysis.
alloy_steel|Alloy steels|8|open_hearth,metallurgy_science|-|tq5 we6|Nickel, chromium and tungsten steels.
metallurgy_science|Metallography|7|bessemer,microscope|+in|tq3 re2|Studying metals under the microscope.
explosives_mining|Blasting|6|gunpowder,mining_shafts|-|mi10 bc4|Gunpowder cracks rock.
dynamite|Dynamite|7|nitroglycerine|-|mi12 bc8 we3|Stable high explosive.
nitroglycerine|Nitroglycerine|7|organic_chemistry|-|mi4 we2|A powerful but unstable explosive.
glassmaking|Glassmaking|2|kilns|-|lu5|Fused sand and ash.
glassblowing|Glassblowing|3|glassmaking|-|lu5 cr3 sp2|Cheap glass vessels.
clear_glass|Clear glass|4|glassblowing,alchemy|-|lu3 re2|Colourless glass for lenses and windows.
window_glass|Window glass|5|clear_glass|-|am2 bc2|Glazed windows let in light, keep out cold.
plate_glass|Plate glass|7|window_glass,steam_engine|-|lu3 cr2|Large flat panes cast and polished.
mortar|Lime mortar|2|lime_burning,masonry|-|bc4|Binding stone with mortar.
concrete|Roman concrete|3|mortar|~hills|bc8|Hydraulic concrete from volcanic ash.
portland_cement|Portland cement|7|kiln_chemistry|-|bc10|Strong, consistent cement.
kiln_chemistry|Kiln chemistry|6|chemistry|-|cr3 bc2|Controlled calcination.
reinforced_concrete|Reinforced concrete|8|portland_cement,bessemer|-|bc12|Steel bars inside concrete.
porcelain|Porcelain|4|glazes,kilns|~hills|lu8 cr2|Fine white ware fired at great heat.
bricks|Mud bricks|1|-|~arid ~river|bc4|Sun-dried bricks.
fired_bricks|Fired bricks|2|bricks,kilns|-|bc5 di1|Durable kiln bricks.
tanning|Tanning|1|hide_working|-|cr3 lu2|Bark tannins make lasting leather.
dyeing|Dyeing|2|weaving|-|lu5|Mordants fix colour in cloth.
purple_dye|Shellfish purple|3|dyeing|@coast|lu6 te2|A rare dye worth its weight in silver.
indigo|Indigo dyeing|3|dyeing|~warm|lu4|Fermented blue dye.
mordants|Alum mordants|3|dyeing|-|lu3|Mineral salts bind dyes.
soap|Soapmaking|3|lime_burning,fermentation|-|di4 lu2|Lye and fat make soap.
alchemy|Alchemy|3|philosophy|+pi +in|re3 lu2|Seeking to transmute matter.
distillation|Distillation|4|alchemy,glassblowing|-|lu4 im1|Separating spirits and essences.
gunpowder_saltpetre|Saltpetre refining|4|alchemy|-|cr1|Purifying nitre from soils.
acids|Mineral acids|5|distillation|-|cr3 re1|Vitriol and aqua fortis.
chemistry|Chemistry|6|acids,scientific_method|+in big|re4 cr4|Elements, compounds and quantitative analysis.
alkali|Soda ash process|6|chemistry|-|cr5 lu2|Industrial alkali for glass and soap.
bleaching|Chemical bleaching|6|chemistry|-|cr4 lu2|Chlorine bleach speeds textile finishing.
organic_chemistry|Organic chemistry|7|chemistry|+in|re3 cr3|Carbon compounds understood and made.
synthetic_dyes|Synthetic dyes|7|organic_chemistry,coal_gas|-|lu6 cr3|Aniline dyes from coal tar.
industrial_chemistry|Industrial chemistry|8|organic_chemistry,electrolysis|-|cr8|Bulk chemical plants.
rubber|Vulcanised rubber|7|organic_chemistry|~jungle|cr4 tr3|Sulphur-cured rubber.
celluloid|Celluloid and plastics|8|organic_chemistry|-|cr4 lu3|The first synthetic polymers.
petroleum|Petroleum refining|7|distillation,drilling|-|cr4 lu2|Kerosene and lubricants from crude oil.
drilling|Percussion drilling|6|explosives_mining,steam_engine|-|mi5|Drilling deep wells for brine and oil.
paper_pulp|Wood-pulp paper|7|chemistry,papermaking|~forest|rt6 sc3|Cheap paper from wood.
`);
