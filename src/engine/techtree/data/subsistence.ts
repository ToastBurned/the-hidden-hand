import { rows, type GenTech } from '../schema';

// Crops: [key, name, tags, domestication era, effects at domestication]
const CROPS: [string, string, string, number, string][] = [
  ['wheat', 'Wheat', '~farm ~grass', 1, 'fy5'],
  ['barley', 'Barley', '~farm ~arid', 1, 'fy4'],
  ['rye', 'Rye', '~cold ~farm', 2, 'fy4'],
  ['oats', 'Oats', '~cold', 2, 'fy3 cv2'],
  ['millet', 'Millet', '~arid ~grass', 1, 'fy4'],
  ['sorghum', 'Sorghum', '~arid ~warm', 1, 'fy5'],
  ['rice', 'Rice', '~river ~marsh ~warm', 1, 'fy7'],
  ['maize', 'Maize', '~warm ~farm', 1, 'fy6'],
  ['potato', 'Potato', '~hills ~cold', 1, 'fy6 fa3'],
  ['sweet_potato', 'Sweet potato', '~warm ~jungle', 1, 'fy4'],
  ['cassava', 'Cassava', '~jungle ~warm', 1, 'fy5 sp3'],
  ['yam', 'Yam', '~jungle', 1, 'fy4'],
  ['taro', 'Taro', '~marsh ~jungle', 1, 'fy4'],
  ['legumes', 'Peas and beans', '~farm', 1, 'fy3 dp4'],
  ['lentils', 'Lentils and chickpeas', '~arid', 1, 'fy3 dp4'],
  ['soybean', 'Soybean', '~warm ~river', 2, 'fy3 dp5'],
  ['flax', 'Flax', '~farm ~cold', 1, 'lu3 cr2'],
  ['cotton', 'Cotton', '~warm ~arid', 2, 'lu4 cr3'],
  ['hemp', 'Hemp', '~farm', 1, 'cr3'],
  ['olive', 'Olive', '~hills ~coast ~arid', 2, 'lu4 fy2'],
  ['grape', 'Grapevine', '~hills ~warm', 2, 'lu5'],
  ['date_palm', 'Date palm', '@arid', 1, 'fy4 sp3'],
  ['sugarcane', 'Sugarcane', '~jungle ~warm', 2, 'lu5'],
  ['tea', 'Tea', '~hills ~jungle', 3, 'lu4 di2'],
  ['coffee', 'Coffee', '~hills ~jungle', 4, 'lu5 re1'],
  ['cacao', 'Cacao', '~jungle', 2, 'lu5'],
  ['banana', 'Banana and plantain', '~jungle', 1, 'fy4'],
  ['squash', 'Squash and gourds', '~warm', 1, 'fy3 sp2'],
  ['peppers', 'Chili and spices', '~warm ~jungle', 2, 'lu3 sp2'],
  ['coconut', 'Coconut palm', '@coast ~jungle', 1, 'fy3 lu2'],
  ['turnip', 'Turnips and fodder roots', '~cold ~farm', 3, 'fy2 fo3'],
  ['clover', 'Clover and alfalfa', '~farm ~grass', 3, 'dp6 fo3'],
];

// Animals: [key, name, tags, era, effects, flag?]
const ANIMALS: [string, string, string, number, string][] = [
  ['dog', 'Dog', '', 0, 'fo4 we1'],
  ['goat', 'Goat', '~hills ~arid', 1, 'fo4 =herding'],
  ['sheep', 'Sheep', '~grass ~hills', 1, 'fo3 lu3 =herding'],
  ['cattle', 'Cattle', '~grass ~farm', 1, 'fo4 fy2 di-2 =herding'],
  ['pig', 'Pig', '~forest', 1, 'fo4 di-2 =herding'],
  ['chicken', 'Chicken', '~warm ~jungle', 1, 'fo3'],
  ['horse', 'Horse', '@grass', 1, 'tr4 cv5 =herding'],
  ['donkey', 'Donkey', '~arid', 1, 'tr4'],
  ['camel', 'Camel', '@arid', 2, 'tr6 cv3 =herding'],
  ['llama', 'Llama and alpaca', '@hills', 1, 'tr3 lu3 =herding'],
  ['yak', 'Yak', '@hills ~cold', 2, 'fo4 tr2 =herding'],
  ['reindeer', 'Reindeer', '@cold', 1, 'fo5 tr3 =herding'],
  ['water_buffalo', 'Water buffalo', '~marsh ~river ~warm', 2, 'fa5 fy3'],
  ['duck', 'Ducks and geese', '~marsh ~river', 1, 'fo3'],
  ['silkworm', 'Silkworm', '~warm ~forest', 2, 'lu8'],
  ['honeybee', 'Honeybee', '~forest ~grass', 1, 'lu3 fy1'],
  ['turkey', 'Turkey', '~forest ~warm', 1, 'fo2'],
  ['guinea_pig', 'Guinea pig', '@hills', 1, 'fo2'],
  ['elephant', 'War elephants', '@jungle', 3, 'we6 bc3'],
  ['falcon', 'Falconry', '~grass ~hills', 2, 'fo2 lu1'],
];

function cropRows(): string {
  const out: string[] = [];
  for (const [k, n, tags, era, eff] of CROPS) {
    out.push(`crop_${k}|${n} cultivation|${era}|agriculture${era >= 3 ? ',seed_selection' : ''}|${tags} !food|${eff}|Cultivation of ${n.toLowerCase()}.`);
    out.push(`crop_${k}_2|Improved ${n.toLowerCase()} varieties|4|crop_${k},seed_selection|${tags}|${eff.replace(/(\d+)/g, (m) => String(Math.max(1, Math.round(+m * 0.8))))}|Selected local varieties of ${n.toLowerCase()} yield more reliably.`);
    out.push(`crop_${k}_3|High-yield ${n.toLowerCase()}|7|crop_${k}_2,plant_breeding|${tags}|${eff.replace(/(\d+)/g, (m) => String(Math.round(+m * 1.4)))}|Scientifically bred ${n.toLowerCase()} strains.`);
  }
  return out.join('\n');
}

function animalRows(): string {
  const out: string[] = [];
  for (const [k, n, tags, era, eff] of ANIMALS) {
    const pre = k === 'dog' ? '-' : k === 'elephant' ? 'husbandry,bronze' : k === 'falcon' ? 'husbandry,bow' : 'husbandry';
    out.push(`ani_${k}|Domesticated ${n.toLowerCase()}|${era}|${pre}|${tags}|${eff}|Taming and keeping of ${n.toLowerCase()}.`);
    const eff2 = eff.split(' ').filter((x) => !x.startsWith('=')).join(' ').replace(/(\d+)/g, (m) => String(Math.max(1, Math.round(+m * 0.7))));
    out.push(`ani_${k}_2|${n} breeding|4|ani_${k},seed_selection|${tags}|${eff2}|Deliberate breeding of better ${n.toLowerCase()} stock.`);
  }
  return out.join('\n');
}

const FORAGING = `
fire_mastery|Fire mastery|0|-|~cold !cold|fo3 am2|Controlled fire for warmth, cooking and protection.
cooking|Cooking|0|fire_mastery|-|fo4 im2|Cooked food is safer and more nourishing.
cordage|Cordage|0|-|-|cr2 fi2|Twisted plant fibre for lines, snares and bindings.
knapping|Flint knapping|0|-|~stone|tq3 we3|Shaped stone blades and points.
hafting|Hafted tools|0|knapping,cordage|-|tq3 wo3 we2|Blades bound to handles.
microliths|Microliths|0|knapping|-|tq2 we2|Composite tools of tiny blades.
spear_thrower|Spear-thrower|0|hafting|~grass ~game|fo5 we4|Levered throws bring down large game.
bow|Bow and arrow|0|hafting,cordage|~forest ~game|fo6 we6|Ranged hunting and war.
arrow_poison|Arrow poisons|0|bow,herbalism|~jungle|fo4 we3|Plant toxins bring down prey.
snares|Snares and traps|0|cordage|~forest ~cold|fo4|Passive trapping of small game.
tracking|Tracking|0|-|~game|fo4|Reading the signs of animals.
foraging_lore|Foraging lore|0|-|-|fo4 im1|Seasonal knowledge of edible plants.
seasonal_rounds|Seasonal rounds|0|foraging_lore|-|fo4|Planned movement between resource patches.
grinding_stones|Grinding stones|0|knapping|-|fo4|Milling wild seeds and nuts.
wild_harvest|Wild grain harvest|0|grinding_stones|~grass ~farm|fo5|Flint sickles gather wild cereals.
fire_farming|Fire-stick burning|0|fire_mastery|~grass ~forest|fo5|Controlled burns renew grazing and game.
honey_hunting|Honey hunting|0|fire_mastery|~forest ~jungle|fo2 lu2|Smoking out wild bees.
fish_weirs|Fish weirs|0|cordage|@river|fi8|Stake traps in rivers and tidal flats.
fishhooks|Bone fishhooks|0|knapping|~coast ~river|fi6|Hooks and lines.
harpoons|Toggling harpoon|0|hafting|@coast ~cold|fi6 fo2|Hunting seals and large fish.
shore_gathering|Shore gathering|0|-|@coast|fi5|Shellfish, seaweed and tide pools.
ice_fishing|Ice fishing|0|fishhooks|@cold|fi5|Fishing through winter ice.
fish_nets|Fishing nets|0|cordage|~coast ~river|fi7|Knotted nets for shoals.
basketry|Basketry|0|cordage|-|sp4 cr2|Woven containers for gathering and storage.
hide_working|Hide working|0|knapping|~cold|am2 lu2|Scraped and cured hides for clothing.
eyed_needles|Eyed needles|0|hide_working|~cold !cold|am3|Fitted clothing for cold climates.
shelters|Pit houses|0|-|~cold|am2|Dug shelters and windbreaks.
smoking_food|Smoking and drying|0|fire_mastery|-|sp8|Preserving meat and fish over smoke.
water_skins|Water skins|0|hide_working|~arid|tr3|Carrying water across dry land.
desert_lore|Desert lore|0|foraging_lore|@arid|fo4 am2|Finding water and food in deserts.
snowshoes|Snowshoes|0|cordage|@cold|tr4 fo3|Travel over deep snow.
sledges|Sledges|0|cordage|@cold|tr4|Dragged loads over snow and ice.
rafts|Rafts|0|cordage|~river|tr2|Bundled reed and log rafts.
dugout|Dugout canoe|0|hafting|~river ~coast|tr3 fi3|Hollowed-log boats.
`;

const FARMING = `
tillage|Digging-stick tillage|1|agriculture|-|fy4|Breaking soil for planting.
hoe|Hoe cultivation|1|tillage,hafting|-|fy4 fa4|Hoes let farmers work more ground.
sickle|Sickles|1|agriculture,knapping|-|fy4|Reaping blades speed the harvest.
threshing|Threshing floors|1|sickle|-|fy3 sp3|Separating grain from chaff.
storage_pits|Storage pits|1|agriculture|!food|sp6|Sealed pits keep grain through winter.
seed_selection|Seed selection|1|agriculture|-|fy4|Saving the best seed for sowing.
slash_burn|Slash-and-burn|1|agriculture,fire_mastery|~forest ~jungle #fieldsys|fy5 fa5 dp-6|Clearing forest plots by fire, then moving on.
fallow|Fallowing|1|agriculture|!soil|dp10|Resting fields restores fertility.
flood_farming|Flood-recession farming|1|agriculture|@river|fy6 dp6|Planting in silt left by floods.
raised_fields|Raised fields|1|agriculture|~marsh ~river|fy6|Mounded beds above wet ground.
manuring|Manuring|1|husbandry,agriculture|!soil|fy4 dp10|Dung returns nutrients to fields.
fences|Fences and hedges|1|husbandry|-|fy2 lo1|Keeping herds out of crops.
transhumance|Transhumance|1|husbandry|~hills ~grass|fo6|Moving herds between seasonal pastures.
dairying|Dairying|1|husbandry|-|fo4 im3|Milk feeds children year-round.
wells|Wells|1|agriculture|~arid|di4 am1|Dug wells give cleaner water.
fermentation|Fermentation|1|pottery|-|sp5 lu3|Controlled spoilage preserves and transforms food.
brewing|Brewing|1|fermentation,agriculture|-|lu4 di2|Beer: calories and safer drink.
salt_making|Salt making|1|-|~coast ~desert|sp8|Evaporating brine for salt.
bread_ovens|Bread ovens|1|pottery,agriculture|-|fo3 lu1|Baking stores grain as bread.
terracing|Terracing|2|agriculture,masonry|@hills|fy6 fa8 dp10|Stepped fields on slopes hold soil and water.
floating_gardens|Floating gardens|2|raised_fields|@marsh|fy10|Fertile beds built up in shallow lakes.
mixed_farming|Mixed farming|2|manuring,husbandry|-|fy4 dp6|Crops and livestock support each other.
grazing_rotation|Rotational grazing|2|husbandry,fences|~grass|fo5 dp5|Moving herds to let pasture recover.
pastoralism|Pastoral nomadism|2|husbandry,riding|@grass #fieldsys|fo8 cv8 tr4|Whole communities following their herds.
cheese|Cheesemaking|2|dairying,pottery|-|sp6 fo2|Milk preserved as cheese.
salting|Salt curing|2|salt_making|-|sp6 fi3|Salted fish and meat keep for months.
querns|Rotary querns|2|grinding_stones,agriculture|-|cr3 fy2|Hand mills grind flour faster.
orchards|Orchards|2|agriculture|~hills|fy3 lu3|Planted fruit and nut trees.
shaduf|Shaduf|2|irrigation|-|fy4|Counterweighted water lifts.
basin_irrigation|Basin irrigation|2|irrigation,flood_farming|@river ~arid|fy8|Banked basins hold floodwater.
cisterns|Cisterns|2|wells,masonry|~arid|di3 fy2|Stored rainwater for the dry season.
wet_paddies|Wet-rice paddies|2|irrigation,crop_rice|@river ~warm|fy10 dp6|Flooded fields of extraordinary yield.
winemaking|Winemaking|2|fermentation,crop_grape|-|lu6|Fermented grape juice for trade and rite.
olive_press|Olive press|3|crop_olive,engineering|-|lu5 cr2|Pressing oil for food, light and trade.
grafting|Grafting|3|orchards|-|fy4 lu2|Joining scions to rootstock.
qanats|Qanats|3|wells,engineering|@arid|fy8 fa6|Underground channels tap distant aquifers.
noria|Noria|3|irrigation,wheel|@river|fy5|Current-driven water wheels lift water.
saqiya|Saqiya|3|irrigation,husbandry,wheel|~arid|fy4|Animal-driven water wheels.
open_fields|Open-field system|3|plough|-|fa5 lo1|Shared strips farmed in common.
drainage|Field drainage|3|engineering|~marsh|fy5 fa5|Ditches turn wet land into fields.
heavy_plough|Heavy plough|4|plough,iron|~forest ~farm ~cold|fa15 fy6|Wheeled ploughs turn heavy clay soils.
horse_collar|Horse collar|4|plough,ani_horse|-|fa10 tr5|Horses pull without choking.
three_field|Three-field rotation|4|rotation|~cold ~farm #rotsys|fy8 dp8|Spring crop, winter crop, fallow.
fish_ponds|Fish ponds|4|drainage|~river ~marsh|fi6|Farmed carp and tilapia.
windmill_drainage|Polders|5|drainage,windmill|@marsh @coast|fa12 fy4|Pumped reclamation of land from the sea.
liming|Liming and marling|5|three_field|!soil|dp8 fy4|Lime and marl sweeten acid soils.
convertible_husbandry|Convertible husbandry|5|three_field,mixed_farming|#rotsys|fy6 dp8|Fields alternate between grass and grain.
four_course|Four-course rotation|6|convertible_husbandry,crop_turnip,crop_clover|-|fy10 dp10 fo3|Wheat, turnips, barley, clover: no fallow.
enclosure|Enclosure|6|three_field|+id|fy8 fa10 lo-2|Private consolidated farms replace common fields.
seed_drill|Seed drill|6|mathematics,four_course|-|fy8|Sowing in rows at even depth.
agronomy|Agronomy|6|four_course,scientific_method|+in|fy6 re2|Experimental study of farming.
plant_breeding|Plant breeding|6|agronomy,botany|-|fy5|Crossing varieties for desired traits.
animal_science|Animal science|6|agronomy|-|fo5 fy3|Scientific stockbreeding and feeding.
guano|Guano fertiliser|7|agronomy,ocean_shipping|-|fy10 dp10|Imported bird-dropping fertiliser.
mech_reaper|Mechanical reaper|7|agronomy,machine_tools|-|fa25|Horse-drawn reaping machines.
steel_plough|Steel plough|7|bessemer,heavy_plough|~grass|fa15 fy4|Self-scouring ploughs break prairie sod.
steam_threshing|Steam threshing|7|steam_engine,threshing|-|fa10 fy3|Threshing machines driven by steam.
chem_fertiliser|Chemical fertilisers|7|organic_chemistry,agronomy|-|fy18 dp15|Superphosphates and potash.
pesticides|Pesticides|7|organic_chemistry|-|fy6|Arsenical and copper sprays.
canning|Canning|7|metal_stamping|-|sp20 am2|Sealed tins preserve food for years.
pasteurisation|Pasteurisation|7|germ_theory|-|im8 sp8|Heating milk kills its microbes.
refrigeration|Refrigeration|8|thermodynamics,electric_motor|-|sp30 im3|Mechanical cold for food storage.
nitrogen_fixation|Synthetic nitrogen|8|industrial_chemistry,electrolysis|-|fy25 dp15|Ammonia made from the air.
tractor|Tractors|8|internal_combustion|-|fa40 fy4|Motor traction replaces draught animals.
hybrid_seed|Hybrid seed|8|genetics,plant_breeding|-|fy15|Hybrid vigour from controlled crosses.
irrigation_pumps|Pumped irrigation|8|electric_motor,irrigation|~arid|fy10 fa8|Motor pumps water fields far from rivers.
dairy_industry|Industrial dairying|8|refrigeration,pasteurisation|-|im4 fo4|Chilled milk delivered to cities.
`;

export const SUBSISTENCE: GenTech[] = rows('subsistence', FORAGING + animalRows() + '\n' + cropRows() + '\n' + FARMING);
