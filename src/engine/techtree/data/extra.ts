/** Early cultural foundations and regional specialities that make paths diverge. */
import { rows } from '../schema';

export const EXTRA = [
  ...rows('society', `
oral_tradition|Oral tradition|0|-|+pi|rt8|Memorised lore and genealogies.
burial_rites|Burial rites|0|-|+pi|lo1|Shared rites bind the community.
shamanism|Shamanic healing|0|-|+pi|im1 lu1|Ritual healers and trance.
gift_exchange|Gift exchange|0|-|!trade|te2|Reciprocal gifts link bands.
storytelling|Storytelling|0|-|-|rt3 lo1|Myths explain the world.
body_ornament|Body ornament|0|-|-|lu2|Beads, shells and tattoos mark identity.
dance_ritual|Ritual dance|0|-|+pi|lo1|Dances bind the group.
age_sets|Age grades|1|kinship_rules|+mi|we2 lo1|Cohorts of young men trained together.
clan_totems|Clan totems|0|kinship_rules|+pi|lo1|Animal emblems of descent.
potlatch|Gift-giving feasts|1|feasting|~coast ~forest|lo1 te1|Prestige through giving away wealth.
slavery|Bonded labour|2|chieftainship|+hi -id|cr2 lo-2|Captives forced to work.
caste|Hereditary castes|3|priesthood_tech|+hi +pi|lo2 cr2|Birth decides occupation.
manumission|Abolition of bondage|6|enlightenment|+id -hi|lo2|Bonded labour outlawed.
nomad_confederation|Nomad confederations|3|pastoralism|@grass +mi|we5 ad2|Tribes of the steppe unite.
tribute_system|Tribute system|3|diplomacy,taxation|+hi|ad2 te2|Neighbours pay homage and gifts.
hostage_exchange|Hostage exchange|2|chieftainship|-|lo1|Hostages guarantee treaties.
dowry|Dowry|2|agriculture|-|lo1|Property passed with brides.
inheritance_rules|Inheritance law|3|property_law|-|lo2|Rules for dividing estates.
sumptuary_laws|Sumptuary laws|4|codified_law|+hi|lo1 lu-2|Dress fixed by rank.
chivalry|Chivalric code|4|feudal_levy|+mi +pi|lo2|A warrior ethic of honour.
manorialism|Manorialism|4|feudal_levy,three_field|+hi|ad2 fy2|Estates worked by tied peasants.
free_cities|Chartered towns|4|merchant_guilds|+id|te3 lo1|Towns govern themselves.
city_leagues|Merchant leagues|5|free_cities,cogs|!trade|te4|Alliances of trading cities.
communal_land|Common land|1|agriculture|-id|lo2|Village land held in common.
irrigation_councils|Water councils|3|irrigation|-id|fy3 lo2|Communities share water fairly.
`),
  ...rows('subsistence', `
seaweed_farming|Seaweed gathering|1|shore_gathering|@coast|fi3 fy2|Kelp as food and fertiliser.
shellfish_beds|Oyster beds|3|shore_gathering|@coast|fi5|Farmed shellfish.
whaling|Whaling|3|harpoons,plank_boats|@coast ~cold|fi6 lu2|Hunting whales for oil and meat.
deep_fishing|Deep-sea fishing|5|carrack,fish_nets|@coast|fi10|Distant fishing grounds.
trawling|Steam trawlers|7|screw_propeller,fish_nets|@coast|fi15|Powered trawl nets.
fish_preserve|Stockfish|4|smoking_food,salting|@coast ~cold|sp6 te2|Dried cod traded far inland.
sago|Sago processing|1|-|@jungle ~marsh|fo5|Starch from palm pith.
acorn_leaching|Acorn leaching|0|grinding_stones|~forest|fo4|Nuts made edible.
pemmican|Pemmican|0|smoking_food|~grass ~cold|sp6 tr2|Dried meat and fat.
wild_rice|Wild rice harvest|0|-|~marsh ~cold|fo4|Lake grains gathered by canoe.
bison_drives|Game drives|0|tracking|@grass|fo6|Herding game over cliffs and into pounds.
reindeer_hunt|Caribou intercept|0|tracking|@cold|fo5|Ambushing migrating herds.
mammoth_bone|Bone architecture|0|hide_working|@cold|am2|Houses of bone and hide.
oasis_gardens|Oasis gardens|2|wells,crop_date_palm|@arid|fy6|Layered gardens under palms.
dry_farming|Dry farming|2|agriculture|@arid|fy4 dp3|Mulch and fallow store scarce rain.
swidden_cycles|Managed swidden|3|slash_burn|~jungle ~forest|dp8|Long fallows restore forest plots.
agroforestry|Agroforestry|3|orchards|~jungle|fy4 dp5|Crops grown beneath trees.
forest_gardens|Forest gardens|2|orchards|~jungle ~forest|fo4 fy2|Managed food forests.
hunting_preserves|Game preserves|3|law|+hi|fo3|Protected hunting grounds.
coppicing|Coppicing|3|iron_tools|~forest|wo10|Trees cut to regrow.
forestry|Scientific forestry|6|botany,coppicing|~forest|wo15|Planned timber harvests.
reforestation|Reforestation|7|forestry|-|wo8 dp3|Replanting cleared land.
hay_meadows|Hay meadows|3|iron_tools,husbandry|~cold|fo5|Winter fodder for herds.
silage|Silage|7|agronomy|-|fo4|Fermented fodder.
sugar_refining|Sugar refining|5|crop_sugarcane,distillation|-|lu6 te2|Refined sugar for export.
beet_sugar|Beet sugar|7|chemistry,crop_turnip|~cold|lu4|Sugar from temperate beets.
plantation|Plantation agriculture|5|ocean_shipping|~warm +hi|lu6 te3 lo-2|Export crops on large estates.
rubber_plantations|Rubber plantations|8|rubber,plantation|~jungle|cr3 te2|Cultivated rubber trees.
spice_trade|Spice trade|4|crop_peppers,caravans|!trade|te4 lu3|Spices carried across the world.
tea_trade|Tea houses|4|crop_tea|-|lu3 di1|Tea culture and trade.
chocolate|Chocolate|5|crop_cacao,sugar_refining|-|lu4|Sweetened cacao.
food_markets|Urban food markets|4|barter_markets|!city|sp3 te2|Supplying cities.
`),
  ...rows('building', `
cliff_dwellings|Cliff dwellings|2|masonry|@hills ~arid|we3 am1|Homes cut into cliffs.
adobe|Adobe architecture|2|bricks|@arid|bc4 am1|Thick mud walls stay cool.
windcatchers|Wind towers|3|adobe|@arid|am2|Towers draw breezes through houses.
ice_houses|Ice houses|3|masonry|~cold ~hills|sp5|Winter ice kept into summer.
step_wells|Step wells|3|wells,masonry|~arid ~warm|di3 fy2|Monumental wells reach falling water tables.
mound_building|Earth mounds|1|-|+pi|lo2|Ceremonial earthworks.
pile_villages|Lake villages|1|carpentry_early|~marsh ~river|we2 fi2|Villages on piles over water.
carpentry_early|Stone-axe carpentry|1|ground_stone|~forest|bc3|Hewn timbers.
hill_forts|Hill forts|2|ditch_bank|@hills|we5|Fortified hilltops.
stave_church|Timber churches|4|timber_frame,monotheism|~forest ~cold|lo1|Great wooden halls of worship.
pagoda|Tiered towers|4|timber_frame|+pi|lo1 lu2|Multi-storey timber towers.
earthquake_build|Earthquake-resistant building|4|timber_frame|@hills|am2|Flexible joints survive tremors.
dikes|Sea dikes|4|drainage|@coast|fa5|Walls against the sea.
flood_control|River levees|3|dams|@river|fy3 am1|Embankments hold back floods.
markets_covered|Covered markets|4|true_arch|!trade|te2|Halls for trade.
hospices|Hospices|4|monasticism|-|am1|Shelter for travellers and the sick.
`),
  ...rows('craft', `
basket_weaving_fine|Coiled basketry|1|basketry|-|lu2 sp2|Watertight baskets.
bark_cloth|Bark cloth|1|-|@jungle|lu2|Beaten bark as cloth.
feather_work|Featherwork|2|-|~jungle|lu4|Feathered cloaks for nobles.
ivory_carving|Ivory carving|2|woodcarving|~jungle ~grass|lu4|Carved tusk and bone.
jade_carving|Jade carving|2|ground_stone|~hills|lu5|Hard stone polished into treasures.
obsidian|Obsidian blades|0|knapping|~hills|tq2 we2|Volcanic glass edges.
amber_trade|Amber working|2|-|~coast ~cold|lu3 te2|Fossil resin ornaments.
pearl_diving|Pearl diving|2|shore_gathering|@coast ~warm|lu5 te2|Divers gather pearls.
salt_mining|Rock salt mining|3|mining_shafts|-|sp4 te2|Mined salt.
glass_beads|Glass beads|3|glassmaking|!trade|lu2 te2|Beads for trade.
enamel|Enamelling|4|glazes,gold_working|-|lu3|Fused glass on metal.
tapestry|Tapestry|4|horizontal_loom,dyeing|-|lu4|Woven pictures.
lace|Lacemaking|5|knitting|-|lu3|Fine openwork.
printing_blocks|Woodblock printing|4|papermaking,woodcarving|#printkind|rt4 lu1|Pages carved and printed.
calico|Printed cotton|5|cotton_cloth,printing_blocks|-|lu4 te2|Block-printed cloth.
`),
  ...rows('military', `
blowguns|Blowguns|0|-|@jungle|fo3 we2|Darts silent in the forest.
boomerang|Throwing sticks|0|-|~arid ~grass|fo3|Curved hunting sticks.
war_canoes|War canoes|1|dugout|~coast ~river +mi|we3|Raiding by water.
raiding|Raiding|1|-|+mi|we3|Swift raids for cattle and captives.
camel_cavalry|Camel cavalry|3|ani_camel|@arid +mi|we4 cv5|Riders of the desert.
mountain_warfare|Mountain warfare|3|slings|@hills +mi|we5|Defending passes and valleys.
jungle_warfare|Forest warfare|1|bow|~jungle ~forest|we4|Ambush in dense cover.
naval_boarding|Boarding tactics|3|war_galleys|-|we3|Grappling and boarding enemy ships.
amphibious|Amphibious landings|5|galleon|-|we3|Armies landed from the sea.
cavalry_saber|Cavalry sabres|5|heavy_cavalry,steel|-|cv4 we2|Curved blades for mounted shock.
`),
  ...rows('health', `
herbal_contraceptives|Herbal abortifacients|2|herbal_pharmacy|+id|fe3|Plant remedies limit births.
breastfeeding_norms|Long breastfeeding|0|-|-|im2 fe2|Nursing for years spaces births.
bathhouses_steam|Steam baths|2|fire_mastery|~cold|di2|Sweat baths for health.
spa_medicine|Mineral springs|4|hospitals|~hills|am1|Healing waters.
asylums|Asylums|6|hospitals|-|lo1|Care for the mentally ill.
`),
  ...rows('knowledge', `
counting_sticks|Tally sticks|0|-|-|rt3 re2|Notched records of counts.
lunar_tally|Lunar tallies|0|counting_sticks|+pi|re2|Tracking moons and seasons.
cave_art|Cave art|0|-|+pi|rt4 lu1|Images that carry stories.
mnemonics|Memory techniques|1|oral_tradition|-|rt3|Songlines and memory palaces.
place_names|Landscape lore|0|-|-|tr2 fo2|Named places mapped in memory.
maps_stick|Stick charts|2|wayfinding|@coast|se4|Charts of swells and islands.
water_clock|Water clocks|3|pottery,astronomy|-|re1 ad1|Measured time by flowing water.
sundial|Sundials|2|calendar,geometry_early|-|re1|Time from shadows.
geometry_early|Rope geometry|2|counting_board|-|bc2|Right angles by knotted ropes.
encyclopaedic_compilations|State compilations|4|great_library,bureaucracy_tech|+hi|rt5|Official collections of knowledge.
translation_movement|Translation schools|4|libraries,diplomacy|+in|re4 rt3|Foreign learning translated.
printing_newspaper_censorship|Censorship|5|printing|+hi -id|lo2 re-2|The state controls printing.
academies_art|Art academies|6|painting_perspective,scientific_societies|-|lu3|Schools of art.
museums|Museums|7|archaeology,public_libraries|-|rt3 sc1|Collections for the public.
weather_science|Meteorology|7|telegraph,physics|-|fy3 se3|Weather maps and forecasts.
standard_time|Standard time|8|railways,telegraph|-|ad2 tr2|Synchronised clocks across countries.
quipu|Knotted cords|2|counting_sticks,cordage|#recordkind|rt4 ad3|Knotted strings record numbers and accounts.
tally_records|Tally records|2|counting_sticks|#recordkind|rt2 ad1|Notched counts for debts and taxes.
genealogies|Genealogies|1|oral_tradition|+hi|rt2 lo1|Lines of descent recited.
almanacs|Almanacs|5|printing,astronomy|-|fy2 sc1|Yearly calendars of advice.
herbals|Printed herbals|5|printing,botany|-|am1|Illustrated plant guides.
`),
];
EXTRA.push(...rows('energy', `
fire_drill|Bow drill fire|0|cordage|-|am1|Fire made at will.
torches|Torches|0|fire_mastery|-|we1 fo1|Light carried at night.
windlass|Windlass and capstan|3|pulleys|-|cr2 se2|Winding gear lifts and hauls.
crank|Crank and connecting rod|4|gearing|-|cr3|Turning rotation into back-and-forth.
flywheel|Flywheels|5|crank|-|cr2|Smooth, stored rotation.
sail_wagons|Wind pumps|5|windmill,pneumatics_early|~arid ~grass|fy3|Wind lifts water from wells.
pneumatics_early|Suction pumps|4|cast_iron|-|mi2|Piston pumps lift water.
whale_oil|Whale-oil lighting|5|whaling|-|re1 lu2|Bright lamps from whale oil.
kerosene_lamps|Kerosene lamps|7|petroleum|-|re2 lu1|Cheap bright light.
`));
