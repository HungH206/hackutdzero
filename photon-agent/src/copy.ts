import type { Language } from './types.ts';

const firstWords = (name: string) => name;

export const copy = {
  welcome: (l: Language, name: string) => l === 'es'
    ? `Hola ${name}, soy Headcount, de tu vecindario. En un día normal no te escribo. Si pasa algo cerca, te preguntaré cómo estás aquí.\n\nUna pregunta: si un vecino necesitara ayuda, ¿qué podrías ofrecer? Por ejemplo camioneta, generador, enfermería, escalera o español. Si nada, responde "nada".`
    : `Hi ${name}, this is Headcount for your neighborhood. On a normal day I stay quiet. If something happens nearby, I'll check on you here.\n\nOne question: if a neighbor needed help, what could you offer? A truck, a generator, nursing, a ladder, another language. "Nothing" is a fine answer.`,
  capabilitiesSaved: (l: Language, list: string[]) => {
    if (list.length === 0) return l === 'es' ? 'Entendido. No te pediré que vayas a ningún lado. Escribe STOP cuando quieras salir.' : "Got it. I won't ask you to go anywhere. Text STOP any time to leave.";
    return l === 'es'
      ? `Anotado: ${list.join(', ')}. Solo te pediré ayuda si eres quien está más cerca, y siempre puedes decir que no. Escribe STOP cuando quieras salir.`
      : `Saved: ${list.join(', ')}. I'll only ask if you're the closest person who can help, and you can always say no. Text STOP any time to leave.`;
  },
  stopped: (l: Language) => l === 'es' ? 'Listo, no te escribiré más.' : "Done. I won't text you again.",
  checkin: (l: Language, kind: string) => {
    const what = l === 'es'
      ? (kind === 'fire' ? 'un incendio en tu edificio' : 'un terremoto cerca')
      : (kind === 'fire' ? 'a fire in your building' : 'an earthquake nearby');
    return l === 'es'
      ? `Headcount: se detectó ${what}. ¿Estás bien? Cuéntame con tus palabras. Si puedes salir, sal primero y responde después.`
      : `Headcount: we detected ${what}. Are you OK? Tell me in your own words. If you can get out, get out first and answer after.`;
  },
  circleCheck: (l: Language, name: string) => l === 'es'
    ? `Headcount: estamos tratando de localizar a ${firstWords(name)} tras una emergencia cerca. Aún no sabemos nada. ¿Has sabido de esta persona o sabes dónde está?`
    : `Headcount: we're trying to reach ${firstWords(name)} after an emergency nearby. Nothing confirmed yet. Have you heard from them, or do you know where they are today?`,
  selfSafe: (l: Language, tally: string) => l === 'es'
    ? `Me alegra. Te marqué como a salvo${tally}. Guarda batería, te escribo si algo cambia.`
    : `Glad you're OK. I've marked you safe${tally}. Save your battery, I'll text if anything changes.`,
  selfHelp: (l: Language) => l === 'es'
    ? 'Te escucho. Ya avisé a la persona que coordina y estoy buscando a alguien cerca. Todavía no puedo decirte quién ni cuándo, y te avisaré en cuanto esté confirmado. Si hay peligro de muerte y puedes, llama al 911. ¿Dónde estás exactamente y qué pasó?'
    : "I hear you. I've told the dispatcher and I'm looking for someone close. I can't tell you who or when yet, and I'll text the moment it's confirmed. If it's life-threatening and you can, call 911. Where exactly are you, and what happened?",
  reportAway: (l: Language, name: string, detail: string) => l === 'es'
    ? `Gracias. Anoté que ${name}: ${detail}. Así nadie va a una casa vacía. Sigue sin confirmarse hasta que hablemos con esta persona, así que si la contactas, dímelo.`
    : `Thank you. I've noted ${name}: ${detail}. That keeps someone from going to an empty home. It stays unconfirmed until we reach them directly, so tell me if you do.`,
  reportSafe: (l: Language, name: string, closed: boolean) => l === 'es'
    ? (closed ? `Gracias. ${name} ya cuenta como localizado.` : `Gracias. Anoté lo que dijiste sobre ${name}, pero sigue sin confirmarse hasta que alguien hable directamente con esta persona.`)
    : (closed ? `Thank you. ${name} now counts as accounted for.` : `Thank you. I've noted that about ${name}, but it stays unconfirmed until someone talks to them directly.`),
  reportHelp: (l: Language, name: string) => l === 'es'
    ? `Gracias. Marqué que ${name} necesita ayuda y avisé a quien coordina. Te aviso cuando alguien confirme que va.`
    : `Thank you. I've flagged that ${name} needs help and told the dispatcher. I'll tell you when someone confirms they're going.`,
  notUnderstood: (l: Language) => l === 'es'
    ? 'No estoy seguro de haber entendido. ¿Estás bien o necesitas ayuda?'
    : "I'm not sure I understood. Are you OK, or do you need help?",
  quietDay: (l: Language) => l === 'es'
    ? 'Todo tranquilo por ahora. Si pasa algo cerca, te escribo aquí.'
    : "All quiet right now. If something happens nearby, I'll text you here.",
  ask: (l: Language, minutes: number, place: string) => l === 'es'
    ? `Headcount: alguien a unos ${minutes} min de ti no ha respondido. ¿Puedes tocar la puerta en ${place}? Solo si es seguro, y no entres a un edificio dañado. Responde sí o no.`
    : `Headcount: someone about ${minutes} min from you hasn't answered. Can you knock at ${place}? Only if it's safe, and don't enter a damaged building. Reply yes or no.`,
  acceptThanks: (l: Language, name: string) => l === 'es'
    ? `Gracias. Pregunta por ${name}. No entres si hay daños. Escríbeme lo que encuentres, aunque sea una palabra.`
    : `Thank you. Ask for ${name}. Don't go in if there's damage. Text me what you find, even one word.`,
  declineThanks: (l: Language) => l === 'es' ? 'No hay problema, gracias por avisar. Buscaré a otra persona.' : 'No problem, thanks for telling me. I\'ll find someone else.',
  followUp: (l: Language, name: string) => l === 'es' ? `¿Pudiste llegar con ${name}? ¿Qué encontraste?` : `Were you able to reach ${name}? What did you find?`,
  foundOkThanks: (l: Language, name: string) => l === 'es' ? `Gracias. ${name} ya cuenta como localizado por ti.` : `Thank you. ${name} is accounted for because of you.`,
  foundHelpThanks: (l: Language) => l === 'es'
    ? 'Gracias. Ya lo marqué como urgente para quien coordina. Quédate cerca si es seguro. Si hay peligro de muerte, llama al 911 ahora.'
    : "Thank you. I've marked this urgent for the dispatcher. Stay close if it's safe. If it's life-threatening, call 911 now.",
  standDown: (l: Language, name: string) => l === 'es' ? `Buenas noticias: ${name} ya fue confirmado. Ya no hace falta que vayas. Gracias.` : `Good news: ${name} has been confirmed. You don't need to go. Thank you.`,
  neighborComing: (l: Language) => l === 'es' ? 'Un vecino aceptó ir a verte. Quédate donde estés si es seguro, y si puedes haz ruido al oírlo.' : 'A neighbor has agreed to come check on you. Stay where you are if it\'s safe, and make noise when you hear them.',
  circleCovered: (l: Language, name: string) => l === 'es' ? `Un vecino aceptó ir a ver a ${name}. Te digo lo que encuentre.` : `A neighbor has agreed to go check on ${name}. I'll tell you what they find.`,
  circleFound: (l: Language, name: string) => l === 'es' ? `Un vecino vio a ${name} en persona y está bien.` : `A neighbor saw ${name} in person and they're OK.`,
  circleFoundHelp: (l: Language, name: string) => l === 'es' ? `Un vecino encontró a ${name} y necesita ayuda. Ya avisé a quien coordina.` : `A neighbor found ${name} and they need help. The dispatcher has been told.`,
  noPromiseFallback: (l: Language) => l === 'es'
    ? 'Ya avisé a quien coordina. Todavía no hay nadie confirmado, y te avisaré en cuanto lo haya.'
    : "I've told the dispatcher. Nobody is confirmed yet, and I'll tell you the moment someone is.",
};
