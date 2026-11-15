/**
 * Names for a Renaissance port city. Each city speaks one of a few invented tongues
 * that sound like the trading coasts of the period (Italianate, Low Countries,
 * Iberian, Anglo-Norman). Given names come from period-flavoured lists; family and
 * place names are built from roots and endings so every city's are its own.
 */
import type { Rng } from './base/rng';

interface Tongue {
  men: string[];
  women: string[];
  roots: string[];
  famEnd: string[];
  placeEnd: string[];
  saintEnd: string[];
}

const TONGUES: Tongue[] = [
  { // Italianate
    men: ['Lorenzo', 'Matteo', 'Piero', 'Giano', 'Taddeo', 'Ercole', 'Bastiano', 'Niccolò', 'Ottavio', 'Corrado', 'Lapo', 'Fazio', 'Gherardo', 'Ugo', 'Vanni', 'Andrea', 'Benedetto', 'Cosimo', 'Dante', 'Emilio', 'Filippo', 'Guido', 'Jacopo', 'Ludovico', 'Marco', 'Orsino', 'Paolo', 'Rinaldo', 'Silvio', 'Tommaso', 'Ubaldo', 'Vieri', 'Agnolo', 'Baldo', 'Cecco', 'Donato', 'Fabrizio', 'Galeazzo', 'Leone', 'Mino'],
    women: ['Lucrezia', 'Ginevra', 'Bianca', 'Caterina', 'Fiammetta', 'Isotta', 'Ottavia', 'Simonetta', 'Contessina', 'Nannina', 'Agnola', 'Beatrice', 'Cassandra', 'Diana', 'Elena', 'Francesca', 'Giulia', 'Ippolita', 'Laudomia', 'Maddalena', 'Nera', 'Olimpia', 'Piccarda', 'Selvaggia', 'Tessa', 'Violante', 'Alessandra', 'Clarice', 'Dianora', 'Lisabetta', 'Margherita', 'Oretta', 'Pippa', 'Smeralda'],
    roots: ['Bell', 'Corv', 'Strozz', 'Mor', 'Vald', 'Tornab', 'Ruc', 'Alt', 'Can', 'Ferr', 'Gual', 'Lanf', 'Mazz', 'Orl', 'Pazz', 'Ross', 'Salv', 'Sper', 'Tos', 'Vell', 'Bard', 'Cap', 'Dor', 'Fosc', 'Grim', 'Lom', 'Marg', 'Nar', 'Pell', 'Rid', 'Scal', 'Tiep', 'Ub', 'Zan', 'Bon', 'Cerv'],
    famEnd: ['etti', 'ini', 'acci', 'oni', 'elli', 'ucci', 'aldi', 'esi', 'ani', 'uzzi', 'arini', 'ondi', 'eschi', 'agna', 'alta'],
    placeEnd: ['ona', 'enza', 'ano', 'aglia', 'eto', 'iera', 'ossa', 'ugia', 'ari', 'olo'],
    saintEnd: ['ino', 'ario', 'iano', 'esto', 'ato'],
  },
  { // Low Countries
    men: ['Joost', 'Pieter', 'Willem', 'Gerrit', 'Maarten', 'Cornelis', 'Jacob', 'Hendrik', 'Lieven', 'Floris', 'Arend', 'Bartel', 'Claes', 'Dirk', 'Evert', 'Frans', 'Gijs', 'Huib', 'Jan', 'Klaas', 'Lodewijk', 'Matthijs', 'Nicolaes', 'Olivier', 'Reinier', 'Sander', 'Teunis', 'Wouter', 'Adriaen', 'Barend', 'Coen', 'Dolf', 'Egbert', 'Godfried', 'Hugo', 'Jeroen', 'Melchior', 'Roelof'],
    women: ['Griet', 'Aleid', 'Machteld', 'Beatrijs', 'Geertruid', 'Lijsbeth', 'Marijke', 'Neeltje', 'Trijn', 'Aagje', 'Barbara', 'Catharina', 'Diewer', 'Elsbeth', 'Femke', 'Grietje', 'Hester', 'Ida', 'Josina', 'Katrijn', 'Lucia', 'Margriet', 'Oda', 'Petronella', 'Reinou', 'Saskia', 'Tryntje', 'Wendelmoet', 'Agatha', 'Brecht', 'Duifje', 'Joanna', 'Maria', 'Weyntje'],
    roots: ['Hal', 'Bree', 'Kort', 'Roos', 'Wit', 'Zand', 'Berg', 'Dijk', 'Hoorn', 'Kamp', 'Leeuw', 'Meer', 'Oost', 'Ruys', 'Steen', 'Velde', 'Wael', 'Bosch', 'Coster', 'Graaf', 'Haas', 'Kerk', 'Lind', 'Molen', 'Noort', 'Poel', 'Rijck', 'Swart', 'Tromp', 'Vos', 'Wouw', 'Ackers', 'Boel', 'Daal', 'Geel', 'Hout'],
    famEnd: ['man', 'stra', 'ink', 'sen', 'hout', 'veld', 'dijk', 'broek', 'kamp', 'hoven', 'ma', 'ens', 'aert', 'wijck', 'ers'],
    placeEnd: ['dam', 'recht', 'hoven', 'drecht', 'wijk', 'mond', 'sluis', 'burg', 'haven', 'kerke'],
    saintEnd: ['aes', 'ert', 'baut', 'olf', 'ijn'],
  },
  { // Iberian
    men: ['Rodrigo', 'Íñigo', 'Gonzalo', 'Álvaro', 'Fadrique', 'Martín', 'Diego', 'Lope', 'Fernán', 'Beltrán', 'Alonso', 'Bartolomé', 'Cristóbal', 'Domingo', 'Esteban', 'Francisco', 'Gaspar', 'Hernando', 'Jaime', 'Juan', 'Lorenzo', 'Miguel', 'Nuño', 'Pedro', 'Ramiro', 'Sancho', 'Tello', 'Vasco', 'Andrés', 'Baltasar', 'Gil', 'Julián', 'Mateo', 'Pascual', 'Rui', 'Tomé'],
    women: ['Leonor', 'Inés', 'Urraca', 'Beatriz', 'Constanza', 'Elvira', 'Catalina', 'Juana', 'Mencía', 'Aldonza', 'Brianda', 'Clara', 'Dominga', 'Estefanía', 'Francisca', 'Guiomar', 'Isabel', 'Jimena', 'Lucía', 'María', 'Marina', 'Olalla', 'Quiteria', 'Sancha', 'Teresa', 'Violante', 'Ana', 'Blanca', 'Felipa', 'Luisa', 'Mayor', 'Oria', 'Petronila'],
    roots: ['Alv', 'Bern', 'Card', 'Dur', 'Esp', 'Gall', 'Herr', 'Lar', 'Mend', 'Nav', 'Orte', 'Pach', 'Quin', 'Rib', 'Salaz', 'Tor', 'Ulloa', 'Vel', 'Zur', 'Beltr', 'Cast', 'Dav', 'Est', 'Guev', 'Lun', 'Mont', 'Osor', 'Peral', 'Ram', 'Sot', 'Tov', 'Vald', 'Zap', 'Arag', 'Benav', 'Cerd'],
    famEnd: ['ez', 'ado', 'era', 'ales', 'ondo', 'illa', 'ana', 'arro', 'aza', 'ego', 'oso', 'ería', 'ón', 'eda', 'ero'],
    placeEnd: ['ena', 'osa', 'ares', 'ejo', 'ira', 'uela', 'ancia', 'eda', 'illo', 'ona'],
    saintEnd: ['icio', 'ardo', 'acio', 'elmo', 'ano'],
  },
  { // Anglo-Norman
    men: ['Ambrose', 'Bartholomew', 'Crispin', 'Drogo', 'Edmund', 'Fulk', 'Gervase', 'Hamon', 'Jasper', 'Lionel', 'Miles', 'Nicholas', 'Osbert', 'Piers', 'Ranulf', 'Simon', 'Thurstan', 'Walter', 'Anselm', 'Baldwin', 'Clement', 'Denis', 'Everard', 'Gilbert', 'Hugh', 'Jocelyn', 'Laurence', 'Martin', 'Nigel', 'Oliver', 'Reynold', 'Stephen', 'Tobias', 'Warin', 'Giles', 'Roger', 'Humphrey', 'Rowland'],
    women: ['Alys', 'Benedicta', 'Cecily', 'Douce', 'Emmeline', 'Felise', 'Godiva', 'Hawise', 'Isolde', 'Joan', 'Lettice', 'Mabel', 'Nichola', 'Orabel', 'Petronel', 'Rohese', 'Sabine', 'Thomasin', 'Avice', 'Beatrix', 'Christian', 'Dionisia', 'Elyn', 'Florence', 'Grace', 'Helewise', 'Idony', 'Juliana', 'Marjory', 'Philippa', 'Rose', 'Tiffany', 'Ursula', 'Wymarc'],
    roots: ['Ash', 'Bel', 'Corn', 'Dar', 'Ever', 'Fair', 'Grey', 'Hol', 'Kemp', 'Lang', 'Mal', 'Nor', 'Oak', 'Pen', 'Quen', 'Rad', 'Sel', 'Thorn', 'Ware', 'Wex', 'Bram', 'Cor', 'Dun', 'Fen', 'Grim', 'Hart', 'Lav', 'Mor', 'Pever', 'Ros', 'Stan', 'Tal', 'Ver', 'Whit', 'Wyn', 'Beau'],
    famEnd: ['ford', 'well', 'ley', 'by', 'ton', 'wick', 'ville', 'mont', 'cote', 'stow', 'hurst', 'ham', 'grave', 'field', 'more'],
    placeEnd: ['mouth', 'haven', 'port', 'chester', 'bury', 'wick', 'stow', 'minster', 'sey', 'holm'],
    saintEnd: ['ric', 'win', 'ulf', 'stan', 'bert'],
  },
];

export function tongueOf(phon: number): Tongue {
  return TONGUES[phon % TONGUES.length];
}

export function givenName(r: Rng, phon: number, sex: 0 | 1): string {
  const t = tongueOf(phon);
  return r.pick(sex ? t.men : t.women);
}

export function surname(r: Rng, phon: number): string {
  const t = tongueOf(phon);
  let root = r.pick(t.roots);
  const end = r.pick(t.famEnd);
  // avoid doubled letters at the join, e.g. "Hal" + "lind"
  if (root.endsWith(end[0])) root = root.slice(0, -1);
  return root + end;
}

export function townName(r: Rng, phon: number): string {
  const t = tongueOf(phon);
  let root = r.pick(t.roots);
  const end = r.pick(t.placeEnd);
  if (root.endsWith(end[0])) root = root.slice(0, -1);
  return root + end;
}

export function saintName(r: Rng, phon: number): string {
  const t = tongueOf(phon);
  if (r.chance(0.5)) return r.pick(r.chance(0.6) ? t.men : t.women);
  let root = r.pick(t.roots);
  const end = r.pick(t.saintEnd);
  if (root.endsWith(end[0])) root = root.slice(0, -1);
  return root + end;
}
