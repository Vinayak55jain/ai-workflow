export const HANDLE_TYPES: Record<
  string,
  Record<string, "text" | "image" | "video" | "audio" | "file" | "number">
> = {
  RequestInput: {
    text_field:  "text",
    image_field: "image",
    video_field: "video",
    audio_field: "audio",
    file_field:  "file",
  },
  CropImage: {
    image_in:   "image",
    x_position: "number",
    y_position: "number",
    width:      "number",
    height:     "number",
    image_out:  "image",
  },
  GeminiModel: {
    prompt:        "text",
    system_prompt: "text",
    image:         "image",
    video:         "video",
    audio:         "audio",
    file:          "file",
    response:      "text",
  },
  Response: { input: "text" },
};
