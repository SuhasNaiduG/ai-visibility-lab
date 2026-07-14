import express, {
  type NextFunction,
  type Request,
  type Response
} from "express";
import { z } from "zod";
import { analyzeUrl } from "./analyze.js";

const analyzeRequestSchema = z.object({
  url: z.string().min(1, "URL is required")
});

export const app = express();

app.use(express.json());

app.get("/health", (_request: Request, response: Response) => {
  response.status(200).json({
    status: "ok"
  });
});

app.post(
  "/api/analyze",
  async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validation = analyzeRequestSchema.safeParse(request.body);

      if (!validation.success) {
        response.status(400).json({
          error: "Invalid request",
          details: validation.error.flatten()
        });

        return;
      }

      const result = await analyzeUrl(validation.data.url);

      response.status(200).json(result);
    } catch (error: unknown) {
      next(error);
    }
  }
);

app.use(
  (
    error: unknown,
    _request: Request,
    response: Response,
    _next: NextFunction
  ): void => {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected analyzer error";

    const isInputError =
      message === "URL is required" ||
      message === "Invalid URL" ||
      message.includes("HTTP and HTTPS");

    response.status(isInputError ? 400 : 502).json({
      error: message
    });
  }
);