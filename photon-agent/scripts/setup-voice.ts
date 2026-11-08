// Creates the Retell LLM and voice agent once. Needs RETELL_API_KEY and PUBLIC_URL (an HTTPS tunnel to VOICE_PORT).
import { Retell } from 'retell-sdk';

const { RETELL_API_KEY, PUBLIC_URL } = process.env;
if (!RETELL_API_KEY || !PUBLIC_URL?.startsWith('https://')) throw new Error('Set RETELL_API_KEY and an https PUBLIC_URL.');
const base = PUBLIC_URL.replace(/\/$/, '');
const client = new Retell({ apiKey: RETELL_API_KEY });

const tool = (name: string, description: string, parameters: object, during: string) => ({
  type: 'custom', name, description, url: `${base}/voice/tool`, method: 'POST', parameters,
  speak_during_execution: true, speak_after_execution: true, execution_message_description: during, timeout_ms: 45_000,
});

const llm = await client.llm.create({
  begin_message: '{{opening}}',
  general_prompt: `You are Headcount, a calm automated voice calling during a neighborhood emergency. Say you're automated if asked. Short sentences, one thought at a time. Wait for the other person to finish.

{{instructions}}

Rules: Never invent facts. Never promise that help is coming. Never give medical advice beyond telling someone to call 911 if it's life-threatening. End politely once you're done.`,
  general_tools: [
    tool('ask_household', 'Text a question to the resident and wait for their answer. Use for anything the brief does not answer.', {
      type: 'object', required: ['question'], properties: { question: { type: 'string', description: 'The question, in plain words.' } },
    }, 'Say briefly that you are asking them by text and it may take a moment.'),
    tool('report_status', "Save whether the person on the phone is OK.", {
      type: 'object', required: ['status', 'detail'], properties: { status: { type: 'string', enum: ['ok', 'needs_help'] }, detail: { type: 'string', description: 'A few words on what they said.' } },
    }, 'Say you are noting that.'),
    { type: 'end_call', name: 'end_call', description: 'End the call when the conversation is finished.' },
  ],
} as never);

const voices = await client.voice.list();
const voice = voices.find((v) => v.provider === 'elevenlabs') ?? voices[0];
if (!voice) throw new Error('Retell returned no voices.');

const agent = await client.agent.create({
  agent_name: 'Headcount',
  response_engine: { type: 'retell-llm', llm_id: llm.llm_id },
  voice_id: voice.voice_id,
  language: 'multi',
  webhook_url: `${base}/voice/webhook`,
} as never);

console.log(`RETELL_AGENT_ID=${agent.agent_id}`);
