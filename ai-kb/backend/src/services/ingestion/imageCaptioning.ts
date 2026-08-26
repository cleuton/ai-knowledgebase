import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "../../config/env.js";
import type { FigureMetadata } from "../../models/types.js";
import type { ExtractedImage } from "./pdfImages.js";

const CAPTIONING_MODEL = "claude-sonnet-5";

const CAPTION_TOOL_NAME = "record_figure_caption";

/** A tool-call schema, not a free-text prompt, is used to get the structured
 * JSON (constitution Principle III) reliably rather than parsing prose. */
const CAPTION_TOOL: Anthropic.Tool = {
  name: CAPTION_TOOL_NAME,
  description: "Records a structured caption for a chart, graph, or infographic image.",
  input_schema: {
    type: "object",
    properties: {
      chartType: { type: "string", description: 'e.g. "bar chart", "line chart", "infographic", "table", "photo"' },
      axes: { type: "string", description: "Axis labels and units, or empty string if not applicable." },
      approximateValues: {
        type: "array",
        items: {
          type: "object",
          properties: { label: { type: "string" }, value: { type: "string" } },
          required: ["label", "value"],
        },
        description: "Best-effort readings of the data points shown.",
      },
      trend: { type: "string", description: "The overall trend or pattern shown, in a short phrase." },
      summary: {
        type: "string",
        description:
          "A dense, natural-language paragraph summarizing the figure's content and its key numeric " +
          "takeaways, written to be a good semantic-search embedding target.",
      },
    },
    required: ["chartType", "axes", "approximateValues", "trend", "summary"],
  },
};

export interface ImageCaption {
  /** Persisted as chunk.figure_metadata (jsonb) — data-model.md. */
  metadata: FigureMetadata;
  /** The dense natural-language paragraph — becomes the chunk's searchable
   * `text`, wrapped in `[FIGURE: ...]` by pdfAssembler.ts (FR-007). */
  summary: string;
}

/** Sends one qualifying image to a vision-capable Claude model and returns a
 * structured caption (chart type, axes, approximate values, trend, and a
 * dense summary) — FR-006, constitution Principle III. Returns null if the
 * model can't produce a caption (e.g., a non-chart photo with nothing to
 * extract); the caller skips that image rather than failing ingestion. */
export async function captionImage(image: ExtractedImage): Promise<ImageCaption | null> {
  const client = new Anthropic({ apiKey: getEnv().anthropicApiKey });

  const response = await client.messages.create({
    model: CAPTIONING_MODEL,
    max_tokens: 1024,
    tools: [CAPTION_TOOL],
    tool_choice: { type: "tool", name: CAPTION_TOOL_NAME },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: image.buffer.toString("base64") },
          },
          {
            type: "text",
            text:
              "Describe this image as a chart/figure caption. Report the chart type, axis labels, " +
              "approximate data values, the overall trend, and a dense natural-language summary " +
              "optimized for semantic search.",
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === CAPTION_TOOL_NAME,
  );
  if (!toolUse) return null;

  const input = toolUse.input as {
    chartType: string;
    axes: string;
    approximateValues: Array<{ label: string; value: string }>;
    trend: string;
    summary: string;
  };
  if (!input.summary) return null;

  return {
    metadata: {
      chartType: input.chartType,
      axes: input.axes,
      approximateValues: input.approximateValues,
      trend: input.trend,
    },
    summary: input.summary,
  };
}
