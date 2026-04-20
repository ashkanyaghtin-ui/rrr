import express from "express";
import { createServer as createViteServer } from "vite";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function findAvailablePort(startPort: number, maxAttempts = 25): Promise<number> {
  for (let offset = 0; offset < maxAttempts; offset++) {
    const port = startPort + offset;

    const isOpen = await new Promise<boolean>((resolve) => {
      const tester = net.createServer();

      tester.once("error", () => {
        resolve(false);
      });

      tester.once("listening", () => {
        tester.close(() => resolve(true));
      });

      tester.listen(port, "0.0.0.0");
    });

    if (isOpen) {
      return port;
    }
  }

  throw new Error(`Unable to find an available port starting at ${startPort}`);
}

async function startServer() {
  const app = express();
  const preferredPort = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Mock PaymentIntent creation (Stripe ignored for now)
  app.post("/api/create-payment-intent", async (req, res) => {
    const { amount, orderId } = req.body;
    // Mocking a client secret for the frontend to proceed
    res.send({ clientSecret: "mock_secret_" + orderId });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const hmrPort = process.env.HMR_PORT
      ? Number(process.env.HMR_PORT)
      : await findAvailablePort(24678);

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          // Pick a free websocket port so HMR doesn't fail when defaults are occupied.
          port: hmrPort,
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const maxPortAttempts = 10;

  const listenOnPort = (port: number, attempt: number) => {
    const server = app.listen(port, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${port}`);
    });

    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE" && attempt < maxPortAttempts) {
        const nextPort = port + 1;
        console.warn(`Port ${port} is busy, retrying on ${nextPort}...`);
        listenOnPort(nextPort, attempt + 1);
        return;
      }

      console.error("Failed to start server:", error);
      process.exit(1);
    });
  };

  listenOnPort(preferredPort, 0);
}

startServer();
