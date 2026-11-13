import { rows } from '../schema';

export const MILITARY = rows('military', `
war_clubs|War clubs|0|-|+mi|we3|Weapons made for fighting people.
ambush|Ambush tactics|0|tracking|+mi !war|we4|Striking from cover.
palisade|Palisades|1|ground_stone|!war|we4|Timber walls around villages.
ditch_bank|Ditch and bank|1|palisade|!war|we3|Earthworks defend settlements.
slings|Slings|1|cordage|~hills|we4|Hurled stones at long range.
shields|Shields|1|leatherwork|+mi|we4|Hide and wicker shields.
maces|Maces|2|copper|+mi|we4|Metal-headed clubs crack skulls.
composite_bow|Composite bow|2|bow,ani_horse|~grass +mi|we7|Horn, wood and sinew bows.
bronze_armour|Bronze armour|2|bronze|+mi +hi|we6|Helmets and scale armour.
spear_formation|Spear formation|2|bronze|+mi #doctrine|we6|Massed spearmen in close order.
horse_archers|Horse archers|3|composite_bow,riding|@grass +mi #doctrine|we8 cv10|Mounted archers wear down any foe.
phalanx|Phalanx|3|spear_formation,bronze_armour|+mi -id|we6|Deep ranks of pikes and shields.
legion|Legions|3|iron,drill|+mi +hi #doctrine|we8 ad2|Flexible professional infantry.
drill|Military drill|2|-|+mi +hi|we4|Training makes soldiers act as one.
city_walls|City walls|2|masonry|!war|we6|Stone walls ring cities.
fortification|Fortification|3|city_walls,engineering|!war|we5|Towers, gates and planned defences.
siege_ramps|Siege ramps|2|masonry|+mi|we3|Earth ramps to breach walls.
battering_ram|Battering rams|2|carpentry|+mi|we3|Shod beams against gates.
siege_towers|Siege towers|3|carpentry,engineering|+mi|we4|Mobile towers over walls.
catapults|Torsion catapults|3|mathematics,carpentry|+mi|we5|Twisted sinew hurls bolts and stones.
iron_swords|Iron swords|3|smithing|+mi|we5|Long blades of iron.
mail|Mail armour|3|wire_drawing_hand|+mi|we5|Interlinked iron rings.
wire_drawing_hand|Hand wire drawing|3|smithing|-|cr2|Drawn wire for mail and jewellery.
war_galleys|War galleys|3|triremes|+mi|we4|Fleets of rowed warships.
greek_fire|Incendiary weapons|4|distillation|+mi|we5|Liquid fire against ships and walls.
crossbow|Crossbow|4|bow,steel|+mi|we6|Easy to learn, punches through armour.
longbow|Longbow|4|bow|~forest +mi|we6|Powerful bows needing lifelong practice.
heavy_cavalry|Heavy cavalry|4|stirrups,mail|+mi +hi #doctrine|we8 cv8|Armoured lancers.
plate_armour|Plate armour|5|steel,cast_iron|+mi|we5|Fitted steel plates.
trebuchet|Trebuchets|4|catapults,pulleys|+mi|we5|Counterweight siege engines.
war_elephants_corps|Elephant corps|3|ani_elephant|+mi|we5|Elephants as shock troops.
military_logistics|Military logistics|3|roads_net,writing|+hi|we4 ad2|Supply depots and baggage trains.
signal_fires|Signal fires|2|-|!war|we2 ad1|Warnings across distances.
war_drums|War music|1|-|+mi|we2|Drums and horns steady the line.
mercenaries|Mercenary companies|4|currency|+id|we4|Soldiers for hire.
knightly_orders|Military orders|4|heavy_cavalry,monasticism|+pi +mi|we4 lo1|Warrior monks.
feudal_levy|Feudal levies|4|heavy_cavalry|+hi|we3 ad1|Service owed for land.
gunpowder|Gunpowder|4|gunpowder_saltpetre|big|we6 mi2|Charcoal, sulphur and saltpetre.
fire_lances|Fire lances|4|gunpowder|+mi|we3|Bamboo tubes of fire.
rockets_early|War rockets|4|gunpowder|-|we3|Gunpowder rockets.
bombards|Bombards|5|gunpowder,cast_iron|+mi|we6|Great guns batter walls.
gunpowder_artillery|Field artillery|5|bombards|+mi|we6|Mobile cannon.
arquebus|Arquebus|5|gunpowder,smithing|+mi|we6|Matchlock firearms.
pike_shot|Pike and shot|5|arquebus,phalanx|+mi|we5|Pikemen guard musketeers.
musket|Musket|5|arquebus|+mi|we5|Heavier firearms.
flintlock|Flintlock|6|musket,spring_power|-|we5|Reliable ignition.
bayonet|Bayonet|6|flintlock|-|we4|Every musketeer a pikeman.
volley_fire|Volley fire|5|musket,drill|+mi|we5|Rank after rank firing in turn.
standing_army|Standing army|5|drill,bureaucracy_tech|+mi +hi|we6 ad2 lo2|Permanent paid soldiers.
military_academy|Military academies|6|standing_army,mathematics|+mi|we4|Schools for officers.
line_tactics|Line infantry|6|bayonet,volley_fire|-|we5|Linear battle tactics.
ships_of_line|Ships of the line|6|galleon|+mi|we6|Three-decked sailing warships.
naval_gunnery|Naval gunnery|6|ships_of_line,mathematics|-|we4|Broadsides at range.
conscription_mass|Mass conscription|7|standing_army,nationalism|+mi|we8|Nations in arms.
general_staff|General staff|7|military_academy,telegraph|+hi|we6 ad2|Planned campaigns.
rifling|Rifled barrels|7|machine_tools,flintlock|-|we6|Accurate long-range fire.
minie_ball|Expanding bullets|7|rifling|-|we5|Rifles loaded as fast as muskets.
percussion_cap|Percussion caps|7|chemistry,flintlock|-|we4|Weatherproof ignition.
breech_loading|Breech-loading rifles|7|rifling,percussion_cap|-|we8|Firing lying down.
rifled_artillery|Rifled artillery|7|rifling,bessemer|-|we8|Long-range shells.
machine_gun|Machine guns|8|breech_loading,smokeless_powder|+mi|we12|Automatic fire.
smokeless_powder|Smokeless powder|8|organic_chemistry|-|we6|Cleaner, stronger propellant.
railway_logistics|Railway mobilisation|8|railways,general_staff|-|we6 ad1|Armies moved by train.
barbed_wire|Barbed wire|7|wire_drawing,bessemer|-|we3 fy2|Wire fences for range and trench.
torpedo|Torpedoes|8|ironclads,internal_combustion|-|we4|Self-propelled naval weapons.
submarine|Submarines|8|torpedo,electric_motor|+mi|we5|Underwater warships.
dreadnought|Dreadnoughts|8|steam_turbine_ship,rifled_artillery|+mi|we6|All-big-gun battleships.
field_telephone|Field telephones|8|telephone|-|we3|Command by wire.
armoured_car|Armoured vehicles|8|automobile,alloy_steel|+mi|we6|Motorised armour.
military_aviation|Military aircraft|8|aviation|+mi|we5|Reconnaissance from the air.
`);
