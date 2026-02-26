import http from "http";
import Bytez from "bytez.js";
import dotenv from "dotenv";
import formidable from "formidable";
import { PassThrough } from "stream";

dotenv.config();

const sdk = new Bytez(process.env.bytez_api_key);
const model = sdk.model("Salesforce/blip-image-captioning-base");

console.log("Model loaded.");

const server = http.createServer(async (req, res) => {
  if (req.url === "/describe" && req.method === "POST") {
    const fileBuffers = new Map(); // store buffers per file

    const form = formidable({
      multiples: false,
      fileWriteStreamHandler: (file) => {
        const pass = new PassThrough();
        const chunks = [];

        pass.on("data", (chunk) => chunks.push(chunk));
        pass.on("end", () =>
          fileBuffers.set(file.newFilename, Buffer.concat(chunks))
        );

        return pass; // Formidable pipes file data here
      }
    });

    form.parse(req, async (err, fields, files) => {
      if (err) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: "Upload error", err }));
      }

      const file = Array.isArray(files.image)
        ? files.image[0]
        : files.image;

      if (!file) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: "No image uploaded" }));
      }

      const fileBuffer = fileBuffers.get(file.newFilename);

      if (!fileBuffer) {
        res.writeHead(500);
        return res.end(JSON.stringify({ error: "Buffer missing" }));
      }

      try {
        const base64 = fileBuffer.toString("base64");
        const type = file.mimetype.includes("png") ? "png" : "jpeg";

        const response = await model.run(
          `data:image/${type};base64,${base64}`
        );

        const caption =
          response.output ||
          response.text ||
          response.output_text ||
          response.results?.[0]?.output_text ||
          null;

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({ caption, raw: response, success: true })
        );
      } catch (e) {
        res.writeHead(500);
        return res.end(JSON.stringify({ error: e.message }));
      }
    });

    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(8000, () => {
  console.log("Server running at http://localhost:8000");
});
