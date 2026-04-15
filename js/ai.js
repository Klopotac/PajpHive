const AI_SERVER = "https://hiveapi.pajp.duckdns.org";
const AI_API_KEY = "hivevoice-secret-key-change-me";

const PROCESSING_TIMEOUT_MS = 8 * 60 * 1000;

const DEFAULT_SYSTEM_PROMPT = `You are an expert beekeeping assistant. A beekeeper has just recorded a voice inspection of one of their hives.
Your job is to analyze the transcript and extract structured information into exactly four categories.

You must respond ONLY with a valid JSON object. No explanation, no markdown, no preamble. No \`\`\`json fences.

The JSON must follow this exact structure:
{
  "notes": "string",
  "warnings": [
    { "id": "w_1", "text": "string", "severity": "warning OR danger" }
  ],
  "reminders": [
    { "id": "r_1", "text": "string", "days_from_now": integer }
  ],
  "todos": [
    { "id": "t_1", "text": "string", "next_inspection": true OR false }
  ]
}

STRICT RULE: Only use information explicitly stated in the transcript. Do not infer, assume, or add anything not directly said.

NOTES: Only factual hive observations from the transcript. No chitchat. No tasks. No warnings. Third person past tense.

WARNINGS severity:
- "danger": aggressive bees, foul smell, suspected disease, no queen AND no eggs, large dead bee count, visible pest infestation.
- "warning": queen not seen but eggs present, low stores, overcrowding, minor pest activity.
- Only warn if something genuinely alarming was explicitly observed. Normal activity = no warning.

REMINDERS: Only if a time was mentioned or clearly implied. days_from_now must be a precise integer. If unsure, omit.

TODOS: Only tasks the beekeeper explicitly stated. If they did not say to do something, return []. NEVER invent tasks. NEVER infer tasks from observations. next_inspection: true ONLY if beekeeper said to check something next inspection.

If a category is empty return [].`;

export async function getSystemPrompt() {
  const resp = await fetch(`${AI_SERVER}/api/system-prompt`, {
    headers: { "X-HiveVoice-Key": AI_API_KEY }
  });
  const data = await resp.json();
  return data.prompt;
}

export async function saveSystemPrompt(prompt) {
  await fetch(`${AI_SERVER}/api/system-prompt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-HiveVoice-Key": AI_API_KEY
    },
    body: JSON.stringify({ prompt })
  });
}

export function resetSystemPrompt() {
  return DEFAULT_SYSTEM_PROMPT;
}

export async function processInspection(audioBlob, hiveId, apiaryId, onStep) {
  const formData = new FormData();
  const ext = audioBlob.type.includes("mp4") ? "mp4"
             : audioBlob.type.includes("ogg") ? "ogg"
             : "webm";
  formData.append("audio", audioBlob, `inspection.${ext}`);
  formData.append("hive_id", hiveId);
  formData.append("apiary_id", apiaryId);
  formData.append("today", new Date().toISOString().split("T")[0]);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROCESSING_TIMEOUT_MS);

  const steps = [
    { ms: 0,      label: "Uploading audio..." },
    { ms: 5000,   label: "Transcribing audio... (Whisper)" },
    { ms: 25000,  label: "Analysing with AI... (Ollama)" },
    { ms: 60000,  label: "Still working — large recording or cold start..." },
    { ms: 120000, label: "Almost there... AI is processing your notes." },
    { ms: 240000, label: "Taking longer than usual — please keep this page open." },
  ];
  const stepTimers = steps.map(({ ms, label }) =>
    setTimeout(() => onStep && onStep(label), ms)
  );

  try {
    const resp = await fetch(`${AI_SERVER}/api/process-inspection`, {
      method: "POST",
      body: formData,
      headers: { "X-HiveVoice-Key": AI_API_KEY },
      signal: controller.signal,
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`AI server error ${resp.status}: ${err}`);
    }
    return await resp.json();
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error(
        "AI processing timed out after 8 minutes. " +
        "Your recording may be very long, or the server is under heavy load. " +
        "Please try again — you can also save a manual note below."
      );
    }
    throw e;
  } finally {
    clearTimeout(timeout);
    stepTimers.forEach(clearTimeout);
  }
}

export async function testPrompt(systemPrompt, transcript) {
  const resp = await fetch(`${AI_SERVER}/api/test-prompt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-HiveVoice-Key": AI_API_KEY,
    },
    body: JSON.stringify({ system_prompt: systemPrompt, transcript }),
    signal: AbortSignal.timeout(120000),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Server error ${resp.status}: ${err}`);
  }
  return await resp.json();
}

export async function checkAIServerHealth() {
  try {
    const resp = await fetch(`${AI_SERVER}/health`, {
      headers: { "X-HiveVoice-Key": AI_API_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return { reachable: false, whisper: false, ollama: false };
    const data = await resp.json();
    return { reachable: true, whisper: !!data.whisper, ollama: !!data.ollama };
  } catch {
    return { reachable: false, whisper: false, ollama: false };
  }
}
