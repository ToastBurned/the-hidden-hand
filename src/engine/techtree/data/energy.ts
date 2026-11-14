import { rows } from '../schema';

export const ENERGY = rows('energy', `
charcoal|Charcoal burning|1|fire_mastery|~forest|mi3 cr2|Charcoal burns hotter than wood.
oil_lamps|Oil lamps|2|pottery|-|re1 lu1|Light after dark.
candles|Candles|2|-|-|re1|Tallow and wax light.
bellows|Bellows|2|leatherwork,copper|-|mi3 cr2|Forced air for furnaces.
draft_power|Draught animals|2|plough|-|fa4 tr2|Animals harnessed to work.
treadmills|Treadmills|3|pulleys|-|cr2|Human and animal-powered machines.
horizontal_mill|Horizontal water mill|3|querns,carpentry|~river #millkind|cr3|Simple water-driven millstones.
water_power|Water power|4|mills|~river|cr6 wo3|Water wheels drive many machines.
overshot_wheel|Overshot wheel|4|water_power|~hills|cr4|More power from falling water.
tide_mills|Tide mills|4|water_power|@coast|cr3|Mills turned by the tide.
windmill|Windmills|4|gearing|~grass ~coast #millkind|cr5 fy2|Wind turns millstones and pumps.
post_mill|Post mills|5|windmill|-|cr3|Mills turned to face the wind.
camshaft|Camshafts|4|water_power|-|cr4|Trip hammers and stamps.
trip_hammer|Trip hammers|4|camshaft,smithing|-|cr3 tq2|Powered hammers for forges.
peat|Peat cutting|2|-|~marsh ~cold|am1|Dried peat for fuel.
coal_heating|Coal fires|4|coal_mining_early|~cold|am2|Coal warms homes.
coal_mining_early|Surface coal|3|mining_shafts|-|mi2|Gathering coal from outcrops.
atmospheric_engine|Atmospheric engine|6|pneumatics,cast_iron|big|mi6 cr4|Steam and vacuum pump water from mines.
steam_engine|Steam engine|6|atmospheric_engine,precision_instruments|big|cr10 mi6|A separate condenser makes steam efficient.
high_pressure_steam|High-pressure steam|7|steam_engine,puddling|-|cr6 tr4|Compact, powerful engines.
compound_engine|Compound engine|7|high_pressure_steam|-|cr4 se3|Steam expanded in stages.
steam_turbine|Steam turbine|8|compound_engine,thermodynamics|-|cr5|Rotary steam power.
gas_engine|Gas engine|7|coal_gas,thermodynamics|-|cr3|Internal combustion of gas.
internal_combustion|Internal combustion engine|8|gas_engine,petroleum|big|tr8 cr5|Compact petrol engines.
diesel|Diesel engine|8|internal_combustion|-|cr3 se3|Compression-ignition engines.
electric_generator|Dynamo|7|electromagnetism,steam_engine|big|cr4|Mechanical work made into current.
electric_motor|Electric motor|8|electric_generator|-|cr8|Current made into work.
power_grid|Power stations|8|electric_generator,steam_turbine|big|cr10 lu3|Central generation and distribution.
alternating_current|Alternating current|8|power_grid,field_theory|-|cr4|Transmission over long distances.
hydroelectric|Hydroelectric power|8|alternating_current,dams|@river|cr6|Rivers make electricity.
electric_light|Electric light|8|electric_generator,plate_glass|-|re3 lo2 lu2|Incandescent lamps.
electrification|Electrification|8|alternating_current,electric_motor|big|cr8 re3 lu3|Electric power for homes and factories.
telegraph|Electric telegraph|7|electromagnetism|big|ad5 te4 re2|Instant messages over wires.
undersea_cable|Undersea cable|8|telegraph,rubber,iron_ships|-|te4 ad2|Continents linked by wire.
telephone|Telephone|8|telegraph,electric_generator|-|te3 ad3|Voices over wires.
radio|Radio|8|field_theory,telephone|-|ad3 se5 sc2|Messages through the air.
oil_drilling|Oil wells|8|drilling,petroleum|-|cr3|Drilled oil fields.
`);
