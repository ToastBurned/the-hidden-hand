import { rows } from '../schema';

export const SOCIETY = rows('society', `
kinship_rules|Kinship rules|0|-|-|lo2|Marriage and descent rules bind clans.
councils_elders|Councils of elders|0|-|-hi|lo2|Disputes settled by the old.
chieftainship|Chieftainship|1|-|+hi|ad2 lo1|A single leader for the community.
feasting|Competitive feasting|1|agriculture|+hi|lo1 lu2|Feasts build prestige and alliances.
bride_wealth|Bride wealth|1|husbandry|-|lo1|Marriage payments in livestock.
ancestor_cult|Ancestor veneration|1|burial_rites|+pi #cosmos|lo2 rt2|The dead watch over the living.
animism|Animism|0|shamanism|+pi #cosmos|lo1 fo1|Spirits in every place and creature.
polytheism|Polytheism|2|ancestor_cult,calendar|+pi #cosmos|lo2|Many gods with many temples.
sky_god|Sky god cult|2|ancestor_cult|+pi +hi #cosmos|lo2 ad1|A supreme god in the heavens.
priesthood_tech|Priesthood|2|polytheism|+pi|lo2 rt3|Full-time religious specialists.
temple_economy|Temple economy|2|priesthood_tech,writing|+pi +hi|ad3 sp2|Temples store and redistribute goods.
divine_kingship|Divine kingship|2|sky_god|+pi +hi|lo4 ad2|The ruler is a god.
oracles|Oracles|2|priesthood_tech|+pi|lo1|Consulting the gods.
monotheism|Monotheism|3|priesthood_tech,writing|+pi|lo3 rt2|One god for all peoples.
dualism|Dualist faith|3|priesthood_tech|+pi|lo2|A cosmic struggle of good and evil.
scripture|Scripture|3|writing,priesthood_tech|+pi|rt5 sc2|Sacred texts fixed in writing.
theology|Theology|4|scripture,philosophy|+pi|rt3 re1|Reasoned doctrine.
monasticism|Monasticism|4|scripture|+pi|rt6 fy2|Communities of monks keep learning.
mysticism|Mysticism|4|theology|+pi|lo1|Direct experience of the divine.
missions|Missionaries|4|scripture|+pi|lo1|Spreading the faith.
pilgrimage|Pilgrimage|3|scripture|+pi|te2|Journeys to sacred places.
religious_tolerance|Religious tolerance|5|theology,ethics|-pi|lo3|Many faiths in one realm.
reformation|Religious reform|5|printing,theology|+id|sc5 lo-2|Scripture for every believer.
secularism|Secular state|6|enlightenment,religious_tolerance|-pi|lo2 ad1|Separation of church and state.
barter_markets|Market days|1|gift_exchange|!trade|te3|Regular gatherings for exchange.
weights_measures|Weights and measures|2|counting_board|-|te4|Standard measures.
commodity_money|Commodity money|2|weights_measures|-|te3|Grain, cattle or shells as money.
coinage_silver|Silver coinage|3|currency,silver_cupellation|-|te3|Coins of silver.
coinage_bronze|Token coinage|3|currency,bronze|-|te2|Small change for daily trade.
contracts|Written contracts|2|writing,law|-|te3 lo1|Binding agreements.
interest_loans|Interest-bearing loans|3|contracts,currency|+id|te3|Lending at interest.
merchant_guilds|Merchant guilds|4|contracts|+id|te4|Merchants organise for protection.
craft_guilds|Craft guilds|4|contracts|-|cr4 lo1|Guilds set standards and train apprentices.
bills_exchange|Bills of exchange|4|banking|!trade|te4|Credit across distance.
double_entry|Double-entry bookkeeping|5|bills_exchange,decimal|+id|te4 ad2|Accounts that balance.
joint_stock|Joint-stock companies|5|double_entry|+id|te4 cr3|Shared capital for big ventures.
stock_exchange|Stock exchange|6|joint_stock|+id|te3 cr2|Shares traded openly.
insurance|Insurance|5|probability_early,merchant_guilds|-|te3|Risks pooled.
probability_early|Reckoning odds|5|algebra|-|te1|Calculating risk.
central_bank|Central bank|6|banking,stock_exchange|+hi|te3 lo2|A lender of last resort.
paper_money|Paper money|4|papermaking,banking|-|te4|Notes stand for coin.
free_trade|Free trade|6|economics_science|+id|te5|Removing tariffs.
mercantilism|Mercantilism|5|joint_stock|+hi|te2 ad2|The state guides trade for power.
limited_liability|Limited liability|7|joint_stock|+id|cr4 te2|Owners risk only their stake.
corporations|Corporations|7|limited_liability,railways|-|cr5 ad1|Large permanent firms.
trade_unions|Trade unions|7|factory_system|-id|lo2 lu2|Workers bargain together.
gold_standard|Gold standard|7|central_bank|-|te3|Currencies fixed to gold.
social_insurance|Social insurance|8|insurance,trade_unions|-id|am3 lo3 fe5|Pensions and sickness pay.
customary_law|Customary law|1|councils_elders|-in #lawtrad|lo3|Unwritten law from precedent of the elders.
codified_law|Civil code|3|law|+hi #lawtrad|lo4 ad2|Comprehensive written codes.
case_law|Case law|4|law,courts|+id #lawtrad|lo4|Judges bound by earlier rulings.
religious_law|Religious law|3|law,scripture|+pi #lawtrad|lo4|Law from revelation.
courts|Courts|3|law|-|lo3|Permanent judges.
juries|Trial by jury|4|courts|+id|lo2|Peers decide guilt.
property_law|Property law|3|law|+id|lo2 te2|Secure titles to land.
land_registry|Land registry|4|property_law,surveying|-|ad2 te2|Recorded ownership.
police|Police|6|courts,town_planning|+hi|lo5|A force to keep order.
prisons|Penitentiaries|6|police|-|lo2|Imprisonment replaces mutilation.
constitution|Constitutionalism|6|enlightenment,case_law|+id|lo4|Rulers bound by law.
civil_rights|Civil rights|7|constitution|+id|lo3|Rights for all citizens.
universal_suffrage|Universal suffrage|8|civil_rights,compulsory_school|+id -hi|lo3|Every adult votes.
taxation|Tribute and taxation|2|chieftainship,writing|+hi|ad3|Regular collection of surplus.
tax_farming|Tax farming|3|taxation,currency|-|ad2 lo-1|Contractors collect taxes.
bureaucracy_tech|Bureaucracy|3|taxation,scribal_schools|+hi|ad5|Salaried officials run the state.
civil_exams|Civil examinations|4|bureaucracy_tech,universities|+hi|ad4 sc2|Officials chosen by examination.
provinces|Provincial government|3|bureaucracy_tech|+hi|ad5|Governors over provinces.
diplomacy|Diplomacy|3|writing|-mi|lo2|Envoys and treaties.
embassies|Resident embassies|5|diplomacy|-|lo1 te1|Permanent ambassadors.
international_law|International law|6|embassies,constitution|-mi|lo2|Law between states.
nationalism|Nationalism|7|newspapers,primary_schools|+mi|lo3 we3|The nation as the people.
federalism|Federalism|7|constitution,provinces|-hi|ad4|Shared sovereignty.
civil_service|Professional civil service|7|civil_exams,statistics|-|ad6|Merit-based administration.
welfare_state|Welfare state|8|social_insurance,civil_service|-id|am3 im3 lo3|The state protects against want.
poor_relief|Poor relief|5|monasticism|-|am2 lo2|Parishes support the destitute.
public_granaries_tech|State granaries|3|bureaucracy_tech|!food|sp4 am2|Grain reserves against famine.
famine_relief|Famine relief|7|railways,civil_service|!food|am4|Food moved to where it is needed.
coffee_houses|Coffee houses|5|crop_coffee|+id|re2 te1|Places of news and debate.
theatre|Theatre|3|rhetoric|-|lo2 lu2|Drama for the public.
epic_poetry|Epic poetry|2|oral_tradition|-|rt3 lo1|Long sung histories.
music_notation|Music notation|4|writing|-|lu2 rt1|Written music.
painting_perspective|Perspective painting|5|geometry|-|lu3|Depth on a flat surface.
sculpture|Monumental sculpture|2|masonry|+pi|lu3 lo1|Statues of gods and kings.
opera|Opera|6|music_notation,theatre|-|lu3|Sung drama.
novels|Novels|6|printing|+id|sc2 lu2|Long prose fiction.
sport|Organised sport|7|railways|-|lo2 am1|Leagues and rules.
mass_media|Mass media|8|radio,rotary_press|-|sc3 lo1|News for the masses.
advertising|Advertising|8|mass_media|-|te3 lu2|Selling to millions.
tourism|Tourism|8|railways,steam_turbine_ship|-|te2 lu2|Travel for pleasure.
`);
