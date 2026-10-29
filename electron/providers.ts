import { providerErrorMessage } from "./providerErrors";
import { responseGenerationConfig } from "./responseConfig";
export type AIProvider = "gemini" | "openai" | "anthropic";
export type AIInput = {
  key: string;
  model: string;
  prompt: string;
  image?: string;
  fast?: boolean;
  provider?: AIProvider;
  windowsLatency?: boolean;
};
export function providerName(provider: AIProvider) {
  return provider === "gemini"
    ? "Gemini"
    : provider === "openai"
      ? "OpenAI"
      : "Claude";
}
export function providerRequest(input: AIInput): {
  url: string;
  headers: Record<string, string>;
  body: object;
} {
  const provider = input.provider ?? "gemini";
  if (!["gemini", "openai", "anthropic"].includes(provider))
    throw new Error("Invalid AI provider.");
  let image: { mime: string; data: string } | undefined;
  if (input.image) {
    const match = input.image.match(
      /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/,
    );
    if (!match || input.image.length > 15000000)
      throw new Error("Invalid screenshot.");
    image = { mime: `image/${match[1]}`, data: match[2] };
  }
  if (provider === "gemini")
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:streamGenerateContent?alt=sse`,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": input.key,
      },
      body: {
        contents: [
          {
            role: "user",
            parts: [
              { text: input.prompt },
              ...(image
                ? [{ inline_data: { mime_type: image.mime, data: image.data } }]
                : []),
            ],
          },
        ],
        generationConfig: responseGenerationConfig(
          input.model,
          input.fast === true,
        ),
      },
    };
  if (provider === "openai")
    return {
      url: "https://api.openai.com/v1/responses",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.key}`,
      },
      body: {
        model: input.model,
        stream: true,
        store: false,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: input.prompt },
              ...(image
                ? [
                    {
                      type: "input_image",
                      image_url: input.image,
                      detail: "high",
                    },
                  ]
                : []),
            ],
          },
        ],
        ...(/^gpt-[56]/.test(input.model) && input.fast
          ? { reasoning: { effort: input.windowsLatency && /^gpt-5\.4-mini(?:-\d{4}-\d{2}-\d{2})?$/.test(input.model) ? "none" : "low" } }
          : {}),
      },
    };
  return {
    url: "https://api.anthropic.com/v1/messages",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": input.key,
      "anthropic-version": "2023-06-01",
    },
    body: {
      model: input.model,
      stream: true,
      max_tokens: input.fast ? 4096 : 8192,
      messages: [
        {
          role: "user",
          content: [
            ...(image
              ? [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: image.mime,
                      data: image.data,
                    },
                  },
                ]
              : []),
            { type: "text", text: input.prompt },
          ],
        },
      ],
      ...(/claude-(?:haiku|sonnet|opus)-5/.test(input.model) && input.fast
        ? { output_config: { effort: "low" } }
        : {}),
    },
  };
}
export function providerChunk(
  provider: AIProvider,
  data: Record<string, any>,
): { text: string; modelVersion?: string } {
  if (data.type === "error" || data.type === "response.failed" || data.error) {
    const error = data.response?.error ?? data.error ?? data;
    throw new Error(providerErrorMessage(Number(error.status ?? 0), null, { error }, providerName(provider)));
  }
  if (data.type === "response.incomplete")
    throw new Error(`${providerName(provider)} response incomplete: ${data.response?.incomplete_details?.reason ?? "output limit or interrupted generation"}. Try again or change the model.`);
  if (provider === "gemini")
    return {
      text: (data.candidates?.[0]?.content?.parts ?? [])
        .filter((part: { thought?: boolean }) => !part.thought)
        .map((part: { text?: string }) => part.text ?? "")
        .join(""),
      modelVersion: data.modelVersion,
    };
  if (provider === "openai")
    return {
      text:
        data.type === "response.output_text.delta" ? (data.delta ?? "") : "",
      modelVersion: data.response?.model,
    };
  return {
    text:
      data.type === "content_block_delta" && data.delta?.type === "text_delta"
        ? (data.delta.text ?? "")
        : "",
    modelVersion: data.message?.model,
  };
}
