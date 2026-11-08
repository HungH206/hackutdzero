// The agent may only tell someone help is coming when a neighbor has accepted a task in the database.
// Every outgoing message passes through here, so a bad template or model reply cannot get past it.

const PROMISES = [
  /\bhelp\b.{0,20}\b(is|are)\b.{0,12}\b(coming|on (the|its) way|en route|arriving)\b/i,
  /\b(someone|somebody|responders?|paramedics?|firefighters?|neighbou?rs?|rescue)\b.{0,24}\b(coming|on (the|their|his|her) way|en route|arriving|will (be there|arrive|come|reach)|agreed to (come|go)|is going)\b/i,
  /\b(we'?ll|we will|i'?ll|i will)\s+(send|get)\b.{0,16}\b(help|someone|rescue)\b/i,
  /\byou('?re| are| will be)\s+(safe now|going to be rescued|rescued)\b/i,
  /\b(ayuda|alguien|rescate|bomberos|param[eé]dicos|vecin[oa]s?)\b.{0,24}\b(viene|vienen|va(n)? en camino|en camino|llega(r[aá])?|llegan|acept[oó] ir)\b/i,
  /\b(te|le)\s+(enviar[eé]|mandar[eé]|enviaremos|mandaremos)\b/i,
];

export function promisesHelp(text: string): boolean {
  return PROMISES.some((p) => p.test(text));
}

export function guardMessage(text: string, helpConfirmed: boolean, fallback: string): { text: string; blocked: boolean } {
  if (!helpConfirmed && promisesHelp(text)) return { text: fallback, blocked: true };
  return { text, blocked: false };
}
