// The agent may only tell someone help is coming when a neighbor has accepted a task in the database.
// Every outgoing message passes through here, so a bad template or model reply cannot get past it.

// \b doesn't work after accented letters in JavaScript, so these use Unicode letter boundaries.
const L = '\\p{L}\\p{N}';
const word = (body: string) => new RegExp(`(?<![${L}])(?:${body})(?![${L}])`, 'iu');

const WHO = "help|someone|somebody|responders?|paramedics?|firefighters?|neighbou?rs?|rescuers?|rescue|an? ambulance|ambulances?|police|the fire department";
const ARRIVING = "(?:coming|on (?:the|their|his|her|its) way|en route|arriving|(?:will|'ll) (?:be there|be here|arrive|come|reach|get there)|agreed to (?:come|go)|(?:is|are) going)";
const QUIEN = 'la ayuda|ayuda|alguien|rescate|rescatistas?|bomberos|param[eé]dicos|ambulancia|vecin[oa]s?';
const LLEGA = 'viene|vienen|va en camino|van en camino|en camino|llega|llegan|llegar[aá]|llegar[aá]n|acept[oó] ir';

const PROMISES = [
  word(`(?:${WHO})(?:'s| is| are)?.{0,24}${ARRIVING}`),
  word(`(?:we'?ll|we will|i'?ll|i will|we are|i am|we're|i'm)\\s+(?:send|sending|get|getting|dispatch|dispatching)\\b.{0,16}(?:help|someone|rescue|an ambulance)`),
  word(`you(?:'re| are| will be)\\s+(?:safe now|going to be rescued|rescued)`),
  word(`(?:${QUIEN}).{0,24}(?:${LLEGA})`),
  word(`(?:ya\\s+)?(?:${LLEGA}).{0,16}(?:${QUIEN})`),
  word(`(?:te|le|les)\\s+(?:enviar[eé]|mandar[eé]|enviaremos|mandaremos)`),
];

export function promisesHelp(text: string): boolean {
  return PROMISES.some((p) => p.test(text));
}

export function guardMessage(text: string, helpConfirmed: boolean, fallback: string): { text: string; blocked: boolean } {
  if (!helpConfirmed && promisesHelp(text)) return { text: fallback, blocked: true };
  return { text, blocked: false };
}
