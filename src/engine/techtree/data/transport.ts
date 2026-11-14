import { rows } from '../schema';

export const TRANSPORT = rows('transport', `
trails|Trail networks|0|-|-|tr2|Known paths between camps.
pack_animals|Pack animals|1|husbandry|-|tr4|Loads carried by animals.
travois|Travois|1|ani_dog|~grass|tr3|Poles dragged by dogs or horses.
dog_sleds|Dog sleds|1|ani_dog,sledges|@cold|tr5|Teams of dogs pull sledges.
ox_carts|Ox carts|2|wheel,ani_cattle|-|tr5|Heavy wagons for farm and trade.
spoked_wheel|Spoked wheel|2|wheel,bronze_tools|-|tr3 cv3|Light, fast wheels.
chariots|Chariots|2|spoked_wheel,ani_horse|+mi|we6 cv6|Horse-drawn war cars.
caravans|Caravans|2|pack_animals|~arid ~grass !trade|tr5 te3|Organised long-distance trains of animals.
camel_caravans|Camel caravans|3|caravans,ani_camel|@arid|tr8 te3|Crossing deserts with camels.
caravanserai|Caravanserais|3|caravans,masonry|!trade|tr4 te2|Inns along trade routes.
relay_posts|Relay stations|3|riding,roads_net|+hi|ad4 tr2|Mounted couriers carry orders across empires.
roads_net|Trunk roads|3|engineering|+hi|tr4 ad2|Built roads join the provinces.
milestones|Milestones and maps|3|roads_net,geometry|-|tr2 ad1|Measured routes.
stirrups|Stirrups|4|saddlery|-|cv10 we3|Riders braced for shock combat.
horseshoes|Horseshoes|4|smithing,ani_horse|-|cv4 tr3|Iron shoes protect hooves.
wagons_pivot|Pivoting front axle|4|ox_carts|-|tr4|Wagons that turn.
coaches|Sprung coaches|5|wagons_pivot,spring_power|-|tr4|Comfortable passenger transport.
postal_service|Postal service|5|coaches,relay_posts|-|ad3 te2 re1|Regular public mail.
turnpikes|Turnpikes|6|roads_net|-|tr4|Toll roads maintained by trusts.
macadam|Macadam roads|6|turnpikes|-|tr5|Crushed-stone surfaces.
railways|Railways|7|steam_locomotive|big|tr25 ad3|Steam railways bind nations together.
steam_locomotive|Steam locomotive|7|high_pressure_steam,puddling|-|tr10|Engines on rails.
rail_signalling|Railway signalling|7|railways,telegraph|-|tr4|Safe dense traffic.
transcontinental|Trunk railways|8|railways,bessemer|-|tr8 ad2|Lines across continents.
automobile|Motor car|8|internal_combustion,rubber|-|tr8|Personal motor transport.
motor_trucks|Motor lorries|8|automobile|-|tr6|Road freight.
electric_tram|Electric trams|8|electric_motor,railways|-|tr4|Electric street railways.
aviation|Powered flight|8|internal_combustion,aerodynamics|-|tr3 re2|Heavier-than-air flying machines.
aerodynamics|Aerodynamics|8|physics,calculus|+in|re2|The science of flight.
paddle|Paddles and canoes|0|dugout|~river|tr2 fi2|Paddled boats on rivers and lakes.
outrigger|Outrigger canoes|1|boats|@coast ~warm|se8 fi3|Stable ocean-going canoes.
reed_boats|Reed boats|1|boats|~river ~marsh|tr2|Bundled reed vessels.
plank_boats|Sewn-plank boats|2|boats,carpentry|@coast|se5 tr2|Planked hulls.
oars|Oared galleys|2|plank_boats|@coast|se5 we2|Rowed ships for war and trade.
square_sail|Square sail|2|sailing|#rig|se5|Running before the wind.
river_barges|River barges|2|plank_boats|@river|tr6|Bulk goods carried downstream.
keel|Keeled hulls|3|plank_boats|@coast|se6|Keels hold a course.
wayfinding|Star-path wayfinding|2|outrigger|~coast #navtrad|se10|Navigating by stars, swells and birds.
pilotage|Coastal pilotage|2|sailing|#navtrad|se5|Knowing the coast by landmarks.
periplus|Sailing directions|3|pilotage,writing|-|se4 te1|Written guides to coasts and ports.
lateen|Lateen sail|3|sailing|#rig|se6|Sailing closer to the wind.
triremes|Triremes|3|oars,bronze|+mi|we4 se2|Rowed warships with rams.
monsoon_sailing|Monsoon sailing|3|sailing,calendar|~warm @coast|se8 te3|Riding seasonal winds across oceans.
junks|Battened junks|4|lateen,watertight|@coast|se6 tr3|Ships with battened sails.
watertight|Watertight bulkheads|4|keel|-|se4|Compartments keep damaged ships afloat.
sternpost_rudder|Sternpost rudder|4|keel|-|se6|Steering large ships.
compass|Magnetic compass|4|lodestone|-|se10|Direction in any weather.
lodestone|Lodestones|3|iron|+in|re1|Stones that point north.
cogs|Cogs|4|sternpost_rudder,square_sail|-|tr5 se2|Deep cargo ships.
carrack|Carracks|5|cogs,lateen|-|se8 tr4|Multi-masted ocean ships.
caravel|Caravels|5|carrack|-|se6|Nimble exploration ships.
portolan|Portolan charts|5|compass,periplus|-|se5|Charts of rhumb lines.
astrolabe_nav|Marine astrolabe|5|astrolabe,navigation|-|se6|Latitude from the sun's height.
galleon|Galleons|5|carrack,gunpowder_artillery|+mi|we5 se3|Armed ocean-going ships.
ocean_shipping|Ocean shipping|5|carrack,portolan|!trade big|tr8 te4|Regular trade across oceans.
dry_dock|Dry docks|5|harbours,canal_locks|-|se3|Ships built and repaired on dry ground.
sextant|Sextant|6|precision_instruments|-|se6|Accurate angles at sea.
chronometer|Marine chronometer|6|pendulum_clock,spring_power|-|se10|Longitude by timekeeping.
copper_sheathing|Copper sheathing|6|carrack|-|se4|Hulls protected from worm and weed.
clipper|Clippers|7|copper_sheathing,sextant|-|se6 tr3|Fast sailing ships.
steamboat|Steamboats|7|high_pressure_steam|~river|tr8|Steam-powered river boats.
screw_propeller|Screw propeller|7|steamboat|-|se8|Efficient steam propulsion.
iron_ships|Iron ships|7|screw_propeller,puddling|@coast|se6 tr4|Iron hulls for steamships.
ironclads|Ironclads|7|iron_ships|+mi|we6|Armoured steam warships.
steam_turbine_ship|Turbine ships|8|steam_turbine,iron_ships|-|se6 tr3|Fast turbine liners.
refrigerated_ships|Refrigerated ships|8|refrigeration,iron_ships|-|sp6 te3|Frozen cargo across oceans.
canals|Canals|5|canal_locks|-|tr8|Artificial waterways.
ship_canals|Ship canals|8|canals,dynamite|-|tr5 se4|Cutting new sea routes.
dredging|Steam dredgers|7|steam_engine,harbours|-|tr3|Deeper harbours and channels.
`);
