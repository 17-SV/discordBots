import {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
} from "discord.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import fs from "node:fs";

dotenv.config();

/* ---------------- Fractonix Identity ---------------- */
const FRACTONIX_NAME = process.env.FRACTONIX_NAME || "Fractonix AI";
const FRACTONIX_LAB = process.env.FRACTONIX_LAB || "Fractonix Labs";
const CONTEXT_LIMIT = parseInt(process.env.CONTEXT_LIMIT || "128000", 10); // 64k or 128k tokens

const SYSTEM_PROMPT = `
You are ${FRACTONIX_NAME}, a helpful, pragmatic AI assistant developed by ${FRACTONIX_LAB}. Only when the user explicitly asks about your identity, origin, creator, or what you are, you must say: That you are ${FRACTONIX_NAME}, developed by ${FRACTONIX_LAB}. And say how you are trained to help them like normally llms are trained to, do not restrict to only mentioning your origin also answer their questions carefully and think clearly what they say.
`;

/* ---------------- Gemini Initialization ---------------- */
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({
  model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  systemInstruction: SYSTEM_PROMPT,
});

/* ---------------- Persistent Memory ---------------- */
const MEMORY_PATH =
  process.env.FRACTONIX_MEMORY_PATH || "./fractonix_memory.json";
let PERSISTED = {};
try {
  if (fs.existsSync(MEMORY_PATH)) {
    PERSISTED = JSON.parse(fs.readFileSync(MEMORY_PATH, "utf-8"));
  }
} catch (_) {
  PERSISTED = {};
}
const saveMemory = () =>
  fs.writeFileSync(MEMORY_PATH, JSON.stringify(PERSISTED, null, 2));

function ensureUserMemory(userId) {
  if (!PERSISTED[userId]) {
    PERSISTED[userId] = { summary: "", turns: [], updatedAt: Date.now() };
  }
  return PERSISTED[userId];
}

/* ---------------- Token Estimation + Compression ---------------- */
function estimateTokens(textOrArray) {
  if (!textOrArray) return 0;
  if (Array.isArray(textOrArray)) {
    return textOrArray.reduce(
      (sum, t) => sum + estimateTokens(t.text || ""),
      0,
    );
  }
  return Math.ceil(textOrArray.length / 4); // Roughly 4 chars/token
}

async function compressOldTurns(userId) {
  const mem = ensureUserMemory(userId);
  if (mem.turns.length < 4) return;
  const textDump = mem.turns
    .map((t) => `${t.role.toUpperCase()}: ${t.text}`)
    .join("\n");
  const prompt = `Summarize this chat into the key facts, goals, and ideas in under 150 words:\n${textDump}`;

  try {
    const res = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 300, temperature: 0.4 },
    });
    const summary = res.response.text().trim();
    mem.summary = `${mem.summary}\n${summary}`.trim();
    mem.turns = mem.turns.slice(-2);
    mem.updatedAt = Date.now();
    saveMemory();
    console.log(`🧠 Compressed memory for user ${userId}`);
  } catch (err) {
    console.warn("Compression failed:", err.message);
  }
}

/* ---------------- Discord Helpers ---------------- */
function makeBaseEmbed() {
  return new EmbedBuilder().setColor("Blue").setTitle(FRACTONIX_NAME);
}
function withinDiscordLimit(str, limit = 4096) {
  return str.length <= limit ? str : str.slice(0, limit - 1) + "…";
}
async function attachmentToInlineData(attachment) {
  if (!attachment?.url) return null;
  const mime = attachment?.contentType || "image/png";
  const res = await fetch(attachment.url);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const b64 = buf.toString("base64");
  return { inlineData: { mimeType: mime, data: b64 } };
}

/* ---------------- Streaming ---------------- */
async function streamToDiscord({
  interaction,
  stream,
  title = FRACTONIX_NAME,
}) {
  let accumulated = "";
  let lastEdit = 0;

  const typing = setInterval(() => {
    interaction.channel?.sendTyping().catch(() => {});
  }, 1400);

  await interaction.editReply({
    embeds: [makeBaseEmbed().setDescription("_Thinking..._")],
  });

  try {
    for await (const chunk of stream) {
      const delta = chunk.text();
      if (!delta) continue;
      accumulated += delta;

      const now = Date.now();
      if (now - lastEdit > 1600) {
        const safeText =
          accumulated.trim().length > 0
            ? withinDiscordLimit(accumulated, 4000)
            : "_Thinking..._"; // 👈 prevent empty description
        await interaction.editReply({
          embeds: [
            makeBaseEmbed()
              .setTitle(`${title} (responding...)`)
              .setDescription(safeText),
          ],
        });
        lastEdit = now;
      }
    }
  } catch (err) {
    console.error("Streaming error:", err);
  } finally {
    clearInterval(typing);
  }

  const finalText =
    accumulated.trim().length > 0 ? accumulated : "_(no response text)_";

  if (finalText.length <= 4096) {
    await interaction.editReply({
      embeds: [
        makeBaseEmbed()
          .setTitle(title)
          .setColor("Green")
          .setDescription(finalText),
      ],
    });
  } else {
    const file = new AttachmentBuilder(Buffer.from(finalText, "utf-8"), {
      name: "fractonix.txt",
      description: "Full response",
    });
    await interaction.editReply({
      embeds: [
        makeBaseEmbed()
          .setTitle(title)
          .setColor("Green")
          .setDescription("Response too long — see attached text file."),
      ],
      files: [file],
    });
  }

  return finalText;
}

/* ---------------- Optional Image Generation ---------------- */
/** ---------- Imagen 4 Generation (Gemini API) ---------- */

/* ---------------- Slash Command ---------------- */
export const data = new SlashCommandBuilder()
  .setName("ask")
  .setDescription(`${FRACTONIX_NAME}: Ask the ai anything`)
  .addStringOption((opt) =>
    opt
      .setName("question")
      .setDescription("Your question or prompt")
      .setRequired(true),
  )
  .addAttachmentOption((opt) =>
    opt
      .setName("image")
      .setDescription("Optional image to analyze")
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("mode")
      .setDescription("Answer or generate image")
      .addChoices(
        { name: "Answer", value: "answer" },
        { name: "Image (generate)", value: "image" },
      )
      .setRequired(false),
  );

/* ---------------- Execute ---------------- */
export async function execute(interaction) {
  const userId = interaction.user.id;
  const question = interaction.options.getString("question");
  const image = interaction.options.getAttachment("image");

  await interaction.deferReply();
  const mem = ensureUserMemory(userId);

  /* ---- Adaptive Context Construction ---- */
  const parts = [];
  if (mem.summary) parts.push({ text: `Summary:\n${mem.summary}\n\n` });
  parts.push({ text: question });
  if (image) {
    const imgData = await attachmentToInlineData(image);
    if (imgData) parts.push(imgData);
  }

  let history = [
    ...mem.turns.map((t) => ({
      role: t.role === "user" ? "user" : "model",
      parts: [{ text: t.text }],
    })),
    { role: "user", parts },
  ];

  const estimatedTokens =
    estimateTokens(mem.summary || "") +
    estimateTokens(mem.turns) +
    estimateTokens(question);
  if (estimatedTokens > CONTEXT_LIMIT * 0.9) {
    console.log(`⚠️ Context nearing ${CONTEXT_LIMIT} tokens, compressing...`);
    await compressOldTurns(userId);
    const updated = ensureUserMemory(userId);
    history = [
      ...(updated.summary
        ? [{ role: "user", parts: [{ text: `Summary:\n${updated.summary}` }] }]
        : []),
      ...updated.turns.map((t) => ({
        role: t.role === "user" ? "user" : "model",
        parts: [{ text: t.text }],
      })),
      { role: "user", parts },
    ];
  }

  /* ---- Generate Stream ---- */
  const maxTokens = Math.min(4096, CONTEXT_LIMIT - estimatedTokens - 1000);
  const streamResult = await model.generateContentStream({
    contents: history,
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
  });

  const finalText = await streamToDiscord({
    interaction,
    stream: streamResult.stream,
  });

  mem.turns.push({
    role: "user",
    text: question + (image ? " [with image]" : ""),
  });
  mem.turns.push({ role: "model", text: finalText });
  mem.updatedAt = Date.now();
  saveMemory();
}
