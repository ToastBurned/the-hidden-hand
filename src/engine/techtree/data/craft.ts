import { rows } from '../schema';

export const CRAFT = rows('craft', `
spindle|Drop spindle|1|weaving|-|cr3 lu2|Spinning thread by hand.
loom_warp|Warp-weighted loom|1|weaving,spindle|-|cr3 lu2|Upright looms for broad cloth.
felt|Felting|1|ani_sheep|~grass ~cold|am2 lu2|Matted wool for tents and boots.
wool|Woollen cloth|2|ani_sheep,loom_warp|~cold|am2 lu3|Warm cloth from fleece.
linen|Linen|2|crop_flax,loom_warp|-|lu4|Fine cloth from flax.
cotton_cloth|Cotton cloth|2|crop_cotton,loom_warp|~warm|lu5|Light, washable cloth.
silk_weaving|Silk weaving|3|ani_silkworm,loom_warp|-|lu8 te2|Luxury cloth prized across the world.
horizontal_loom|Treadle loom|4|loom_warp,carpentry|-|cr5 lu2|Foot-powered looms speed weaving.
drawloom|Drawloom|4|horizontal_loom,silk_weaving|-|lu6|Patterned figured silks.
spinning_wheel|Spinning wheel|4|spindle,wheel|-|cr5|Faster spinning.
fulling_mill|Fulling mill|4|mills,wool|-|cr4|Water-powered cloth finishing.
knitting|Knitting|4|wool|-|am1 lu2|Fitted garments from yarn.
carpets|Carpet knotting|4|wool,dyeing|~grass ~arid|lu6 te2|Knotted pile carpets for trade.
flying_shuttle|Flying shuttle|6|horizontal_loom|-|cr8|One weaver, double the cloth.
spinning_jenny|Spinning jenny|6|spinning_wheel,flying_shuttle|-|cr8|Many spindles turned at once.
water_frame|Water frame|6|spinning_jenny,water_power|big|cr10|Water-powered spinning mills.
spinning_mule|Spinning mule|6|water_frame|-|cr6 lu2|Fine strong yarn by machine.
power_loom|Power loom|7|water_frame,steam_engine|-|cr10|Steam-driven weaving.
jacquard|Jacquard loom|7|drawloom,power_loom|-|lu5 re1|Punched cards control the pattern.
cotton_gin|Cotton gin|6|crop_cotton,gearing|-|cr5|Separating seed from fibre by machine.
sewing_machine|Sewing machine|7|machine_tools|-|cr5 lu2|Mechanised stitching.
ready_clothing|Ready-made clothing|7|sewing_machine,power_loom|-|lu4 am1|Factory garments for all.
synthetic_fibres|Rayon|8|celluloid,industrial_chemistry|-|lu4 cr3|Artificial silk from cellulose.
woodcarving|Woodcarving|0|hafting|~forest|lu2|Carved bowls, figures and handles.
carpentry|Carpentry|2|bronze_tools|~forest|bc4 cr3|Joined timber for houses and boats.
joinery|Mortise and tenon|2|carpentry|-|bc3|Strong timber joints without nails.
lathe|Bow lathe|3|carpentry|-|cr4|Turning wood for bowls and spindles.
cooperage|Cooperage|3|carpentry,iron_tools|-|sp6 tr2|Barrels for storing and shipping.
plane|Woodworking plane|3|carpentry,iron_tools|-|cr3 bc2|Smoothing timber.
saw_iron|Iron saws|3|iron_tools|~forest|wo5 bc2|Sawing planks.
veneers|Veneers and inlay|4|plane|-|lu4|Decorative woodwork.
sawmill|Sawmill|5|water_power,saw_iron|~forest|wo10 bc4|Water-driven saws.
leatherwork|Leatherwork|1|tanning|-|cr2 cv2|Harness, shoes and containers.
saddlery|Saddlery|3|leatherwork,riding|-|cv5|Saddles for riders.
basket_boats|Hide boats|1|leatherwork|~river ~cold|tr2|Coracles and kayaks.
jewellery|Jewellery|2|gold_working|-|lu4|Fine ornaments signal status.
bead_trade|Beadwork|1|-|!trade|lu2 te1|Beads as ornaments and exchange.
lacquer|Lacquerware|4|woodcarving,crop_tea|~forest ~warm|lu5|Resin-lacquered goods.
papermaking|Papermaking|3|writing|-|rt8 cr2|Paper from plant fibre: cheap writing surfaces.
paper_mill|Paper mill|5|papermaking,water_power|-|rt5 cr2|Water-driven pulping.
bookbinding|Bookbinding|4|papermaking,leatherwork|-|rt4|Codices are durable and portable.
parchment|Parchment|3|writing,tanning|#medium|rt5|Prepared animal skin for writing.
papyrus|Reed paper|2|writing|~river ~marsh #medium|rt5 te1|Sheets from marsh reeds.
clay_tablets|Clay tablets|2|writing,pottery|#medium|rt6|Inscribed clay that survives fire.
inks|Inks|2|writing|-|rt3|Carbon and iron-gall inks.
gearing|Gearing|4|lathe,mills|-|cr4|Toothed wheels transmit power.
clockwork|Mechanical clock|5|gearing,astronomy|+in|re3 lo1 cr2|Escapement clocks regulate time and work.
pendulum_clock|Pendulum clock|6|clockwork,physics|-|re3 se3|Accurate timekeeping.
spring_power|Mainsprings|5|clockwork,steel|-|cr2 lu2|Portable clocks and locks.
lenses|Lenses|4|clear_glass|-|re3 am1|Ground glass magnifies.
spectacles|Spectacles|5|lenses|-|re3 cr3|Older craftsmen keep working.
precision_instruments|Precision instruments|6|lenses,clockwork|+in|re4 se3|Calibrated scales and gauges.
interchangeable_parts|Interchangeable parts|7|machine_tools|-|cr8 we4|Standard components assembled anywhere.
machine_tools|Machine tools|7|precision_instruments,steam_engine|big|cr10 tq4|Lathes and planers that make machines.
metal_stamping|Metal stamping|7|machine_tools|-|cr4|Pressing sheet metal into shapes.
factory_system|Factory system|7|power_loom|+hi|cr10 lo-2 ad2|Centralised mechanised production.
assembly_line|Assembly line|8|interchangeable_parts,electric_motor|-|cr12|Moving lines of standard work.
typewriter|Typewriter|7|machine_tools|-|ad3 rt2|Mechanical writing for offices.
bicycles|Bicycle|7|machine_tools,rubber|-|tr4|Cheap personal transport.
photography|Photography|7|chemistry,lenses|-|rt5 re2|Images fixed in silver salts.
phonograph|Phonograph|8|telephone|-|lu3 rt2|Recorded sound.
cinema|Cinema|8|photography,electric_light|-|lu4|Moving pictures.
mass_production|Mass production|8|assembly_line,factory_system|big|cr12 lu4|Consumer goods for the many.
calculating_machines|Calculating machines|7|machine_tools,mathematics|-|re3 ad3|Mechanical arithmetic.
tabulators|Punched-card tabulators|8|calculating_machines,electric_motor|-|ad5 re3|Census and accounts by machine.
locksmithing|Locks|3|smithing|-|lo2 te1|Iron locks guard property.
nails|Mass nail-making|5|wire_drawing|-|bc3|Cheap nails for building.
cutlery|Cutlery|6|crucible_steel_cast|-|lu2 cr2|Steel knives for every home.
soapworks|Soap works|6|soap,alkali|-|di4|Mass-produced soap.
matchmaking|Friction matches|7|chemistry|-|cr1 am1|Fire on demand.
glass_bottles|Machine-made bottles|8|plate_glass,electric_motor|-|sp4|Cheap sealed containers.
`);
