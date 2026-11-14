import { rows } from '../schema';

export const HEALTH = rows('health', `
wound_care|Wound care|0|-|-|am2|Binding and cleaning wounds.
bone_setting|Bone setting|0|wound_care|-|am2|Splinting fractures.
midwifery|Midwifery|0|-|-|im4|Skilled help at birth.
medicinal_plants|Medicinal plant lore|0|foraging_lore|~forest ~jungle|im2 am1|Knowing which plants heal.
trepanning|Trepanning|1|knapping|+pi|am1|Opening the skull.
quarantine_custom|Shunning the sick|1|-|!plague|di4|Keeping the sick apart.
herbal_pharmacy|Herbal pharmacy|2|herbalism,pottery|-|im2 am2|Prepared remedies stored for use.
temple_healing|Temple healing|2|herbalism|+pi #medtrad|am2 lo1|Priest-physicians and sanctuaries.
humoral_medicine|Humoral medicine|3|herbalism,philosophy|+in #medtrad|am2|Balancing the body's fluids.
pulse_diagnosis|Pulse diagnosis|3|herbalism,philosophy|#medtrad|am3|Reading health in the pulse.
acupuncture|Acupuncture|3|pulse_diagnosis|-|am1|Needles at points of the body.
surgery_early|Surgery|3|bronze_tools,wound_care|-|am3|Cutting to heal.
dentistry|Dentistry|3|surgery_early|-|am1|Pulling and filling teeth.
eye_surgery|Cataract couching|3|surgery_early|-|re1|Restoring sight.
pharmacology_early|Materia medica|3|herbal_pharmacy,writing|-|am2 im1|Written catalogues of drugs.
hospitals|Hospitals|4|medicine|+pi|am4 di2|Institutions for the sick.
leprosaria|Leper houses|4|hospitals|!plague|di3|Isolation of chronic disease.
quarantine|Quarantine|4|medicine|!plague|di8|Forty days' isolation of ships and travellers.
plague_doctors|Public physicians|4|medicine,law|!plague|di4|Towns hire physicians.
inoculation_smallpox|Variolation|5|medicine|!plague|di6 im4|Deliberate mild infection protects.
anatomy|Anatomy|5|medicine,printing|+in|am3 re1|Systematic dissection.
pharmacies|Apothecaries|5|pharmacology_early,distillation|-|am2|Licensed dispensers of drugs.
cinchona|Fever bark|5|botany,ocean_shipping|~jungle ~warm|am4 di3|Bark that cures malarial fever.
scurvy_cure|Citrus against scurvy|6|scientific_method,ocean_shipping|-|am2 se2|Fresh fruit prevents scurvy.
obstetric_forceps|Obstetric forceps|6|anatomy|-|im4|Safer difficult births.
circulation|Blood circulation|5|anatomy|-|re1 am1|The heart pumps blood.
vaccination|Vaccination|6|inoculation_smallpox,scientific_method|big|di10 im10|Cowpox protects against smallpox.
statistics_med|Medical statistics|6|statistics,hospitals|-|di3 am2|Counting deaths reveals causes.
public_health|Public health|7|statistics_med,sanitation|big|di10 im6 am4|States act to prevent disease.
anaesthesia|Anaesthesia|7|chemistry,surgery_early|-|am4|Painless surgery.
antisepsis|Antisepsis|7|germ_theory|-|am6 im4|Carbolic acid prevents infection.
germ_theory|Germ theory|7|microscope,scientific_method|big|di10 im6|Microbes cause disease.
nursing|Trained nursing|7|hospitals,public_health|-|am3 im3|Professional nurses.
epidemiology|Epidemiology|7|statistics_med,germ_theory|!plague|di8|Tracing outbreaks to their source.
vaccines_new|New vaccines|8|germ_theory,vaccination|-|di10 im8|Rabies, diphtheria, typhoid.
antitoxins|Antitoxins|8|vaccines_new|-|im5 am2|Serum therapy.
xrays|X-rays|8|electric_light,physics|-|am3|Seeing inside the body.
aspirin|Synthetic drugs|8|organic_chemistry|-|am3|Manufactured medicines.
blood_groups|Blood transfusion|8|germ_theory|-|am2|Safe transfusion.
vitamins|Nutrition science|8|chemistry,germ_theory|-|im4 am2|Diet and deficiency disease.
infant_welfare|Infant welfare clinics|8|public_health,nursing|-|im10|Clinics for mothers and babies.
contraception_trad|Traditional birth spacing|1|herbalism|+id|fe4|Herbs and abstinence space births.
late_marriage|Late marriage pattern|4|-|+id -pi|fe8|Couples marry in their mid-twenties.
family_planning|Family planning|7|public_health|+id -pi|fe15|Deliberate limits on family size.
rubber_contraception|Modern contraception|8|rubber,family_planning|+id|fe20|Reliable contraception.
child_labour_laws|Child labour laws|7|factory_system,civil_rights|-|sc10 fe5|Children in school, not mills.
`);
