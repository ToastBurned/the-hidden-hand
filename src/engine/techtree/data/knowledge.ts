import { rows } from '../schema';

export const KNOWLEDGE = rows('knowledge', `
star_lore|Star lore|0|oral_tradition|-|re1 se2|Named stars and their seasons.
tokens|Clay tokens|1|counting_sticks,pottery|!trade|rt3 te1|Counters stand for goods.
pictographs|Pictographs|1|tokens|-|rt4|Pictures record things and deeds.
seals|Seals|2|pictographs|+hi|ad2 te1|Marks of ownership and authority.
logograms|Logographic script|2|writing|#script|rt5 ad2|A sign for each word.
syllabary|Syllabary|3|writing|#script|rt5 sc2|A sign for each syllable.
alphabet|Alphabet|3|writing|#script|rt4 sc5|Few letters, quickly learned.
scribal_schools|Scribal schools|2|writing|+hi|sc4 ad2|Training scribes.
archives|Archives|2|writing,clay_tablets|-|rt8|Stored records of the state.
libraries|Libraries|3|archives,papyrus|+in|rt8 re2|Collections of texts.
great_library|Great libraries|4|libraries,philosophy|+in $1.2|rt8 re4|Gathering all known writing.
encyclopaedia|Encyclopaedias|6|printing,enlightenment|+in|rt8 re3|Knowledge arranged for all.
newspapers|Newspapers|6|printing,postal_service|+id|re2 sc2 lo-1|Regular printed news.
public_libraries|Public libraries|7|encyclopaedia,paper_pulp|-|sc5 rt4|Free reading for everyone.
movable_type|Movable type|5|printing,brass|-|rt5 re2|Recombinable cast letters.
rotary_press|Rotary press|7|movable_type,steam_engine|-|rt5 sc3|Mass printing.
counting_board|Counting boards|2|counting_sticks|-|re2 te1|Calculating with pebbles on lines.
base60|Sexagesimal numbers|2|counting_board|#numeral|re3|Base-sixty arithmetic for astronomy.
base20|Vigesimal numbers|2|counting_board|#numeral|re2|Counting in twenties.
decimal|Decimal positional numbers|3|mathematics|#numeral|re4 te2|Place-value numbers with zero.
geometry|Geometry|3|mathematics|+in|re3 bc3|Proof and measure of shapes.
abacus|Abacus|3|counting_board|-|te2 ad1|Fast mechanical reckoning.
zero|Zero|4|decimal|-|re3|Zero as a number.
algebra|Algebra|4|zero|+in|re4|Solving for the unknown.
trigonometry|Trigonometry|4|geometry,astronomy|-|re3 se3|Measuring with triangles.
logarithms|Logarithms|5|algebra|-|re3 se2|Multiplication by addition.
analytic_geometry|Analytic geometry|5|algebra,geometry|-|re3|Shapes as equations.
calculus|Calculus|6|analytic_geometry|+in|re5|Rates of change and areas.
probability|Probability|6|algebra|-|re2 te2|Calculating chance.
statistics|Statistics|6|probability|-|ad3 re2|Measuring populations.
non_euclid|Non-Euclidean geometry|7|calculus|-|re2|New geometries.
mathematical_logic|Mathematical logic|8|non_euclid|-|re3|Logic made rigorous.
lunar_calendar|Lunar calendar|1|lunar_tally|#caltype|re1 lo1|Months by the moon.
solar_calendar|Solar calendar|2|calendar|#caltype|fy3|Years by the sun.
lunisolar|Lunisolar calendar|2|calendar,lunar_lore|#caltype|fy2 lo1|Moon months fitted to the solar year.
lunar_lore|Moon lore|1|star_lore|+pi|re1|Phases and eclipses.
observatories|Observatories|3|calendar,masonry|+pi +in|re3|Fixed places to watch the sky.
astronomy|Astronomy|3|observatories,mathematics|+in|re3 se3|Predicting the heavens.
astrology|Astrology|3|astronomy|+pi|lo1|Reading fate in the stars.
astrolabe|Astrolabe|4|astronomy,brass|-|se3 re2|Instrument for the sky's angles.
heliocentrism|Heliocentrism|5|astronomy,trigonometry|+in -pi|re3|The Earth moves round the Sun.
telescope|Telescope|5|lenses,heliocentrism|-|re4 se2|Seeing the far away.
celestial_mechanics|Celestial mechanics|6|calculus,telescope|-|re3|Gravity explains the planets.
logic|Formal logic|3|philosophy|+in|re3|Rules of valid reasoning.
rhetoric|Rhetoric|3|philosophy|-|lo2|The art of persuasion.
ethics|Ethics|3|philosophy|-|lo2|Reasoning about the good life.
natural_philosophy|Natural philosophy|4|logic|+in|re3|Inquiry into nature.
universities|Universities|4|natural_philosophy,scribal_schools|+in|re5 sc3|Self-governing schools of learning.
scholasticism|Scholasticism|4|universities,theology|+pi|re2 rt3|Reconciling reason and faith.
humanism|Humanism|5|universities,printing|+in +id|re3 sc3|Study of human affairs and classics.
experiment|Experimentation|5|natural_philosophy,humanism|+in|re4|Testing ideas against nature.
scientific_method|Scientific method|5|experiment|+in big|re8|Hypothesis, test and peer criticism.
scientific_societies|Scientific societies|6|scientific_method|+in|re5|Academies share discoveries.
journals|Scientific journals|6|scientific_societies,printing|-|re5 rt3|Published results.
physics|Mechanics|6|scientific_method,calculus|+in|re4 cr2|Laws of motion.
optics|Optics|5|lenses,geometry|-|re3|The science of light.
microscope|Microscope|6|optics|-|re4|Seeing the very small.
botany|Botany|5|scientific_method,herbal_pharmacy|-|fy2 am1 re1|Classifying plants.
zoology|Zoology|6|botany|-|fo2 re1|Classifying animals.
taxonomy|Taxonomy|6|botany,zoology|-|re2|Ordered names for all life.
geology|Geology|6|scientific_method,mining_shafts|-|mi5 re1|Reading the rocks.
cartography|Cartography|4|geometry,periplus|-|ad2 se3 tr2|Measured maps.
surveying|Surveying|3|geometry|-|bc2 ad2|Measuring land.
triangulation|Triangulation survey|6|surveying,trigonometry|-|ad2 tr2|Mapping whole countries.
census|Census|3|writing,surveying|+hi|ad4|Counting people for tax and levy.
pneumatics|Pneumatics|6|physics|-|cr2|Air pressure and vacuum.
thermodynamics|Thermodynamics|7|steam_engine,physics|+in|re3 cr4|Heat, work and efficiency.
electricity_static|Static electricity|6|physics|-|re1|Charges and sparks.
battery|Voltaic pile|6|electricity_static,chemistry|-|re2|Steady electric current.
electromagnetism|Electromagnetism|7|battery|+in big|re4|Currents make magnetism.
electrolysis|Electrolysis|7|battery,chemistry|-|cr3|Splitting compounds with current.
field_theory|Field theory|7|electromagnetism,calculus|+in|re3|Light as an electromagnetic wave.
atomic_theory|Atomic theory|7|chemistry|-|re3|Matter made of atoms.
periodic_table|Periodic table|7|atomic_theory|-|re3 cr2|Ordering the elements.
evolution|Evolution by selection|7|taxonomy,geology|+in -pi|re3|Species change over time.
genetics|Genetics|8|evolution,microscope|-|re2 fy2|Heredity in units.
radioactivity|Radioactivity|8|xrays,periodic_table|-|re3|Atoms decay.
relativity|Relativity|8|field_theory,mathematical_logic|+in|re3|Space and time are relative.
quantum|Quantum theory|8|radioactivity,relativity|-|re3|Energy in quanta.
economics_science|Political economy|6|enlightenment,statistics|+id|te4 ad2|Markets studied systematically.
sociology|Social science|7|economics_science,statistics|-|ad2 lo2|Studying societies.
psychology|Psychology|8|sociology|-|lo1|Studying the mind.
archaeology|Archaeology|7|geology|-|rt3|Recovering the past from the ground.
linguistics|Philology|6|humanism|-|rt2|The history of languages.
dictionaries|Dictionaries|5|printing|-|sc2 rt2|Fixed spellings and meanings.
grammar|Grammar|3|writing,rhetoric|-|sc2|Rules of language.
primary_schools|Primary schools|6|printing,alphabet|-|sc10|Basic schooling in reading and number.
compulsory_school|Compulsory schooling|7|primary_schools,nationalism|+hi|sc15 fe5|All children must attend school.
teacher_training|Teacher training|7|primary_schools|-|sc8|Normal schools train teachers.
technical_schools|Technical colleges|7|universities,machine_tools|-|re4 cr4|Training engineers.
research_labs|Research laboratories|8|technical_schools,organic_chemistry|+in|re8|Invention as an industry.
patents|Patents|6|law,printing|+id|re4|Inventors own their ideas.
enlightenment|Enlightenment|6|scientific_method,humanism|+in -pi big|re4 lo1|Reason applied to every question.
`);
