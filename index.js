require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const port = process.env.PORT || 5000;

// middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://irenity0-control-panel.vercel.app",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.5st1jdm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.JWT_ACCESS_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    const eventsCollection = client.db("control_panel").collection("events");

    app.post("/jwt", async (req, res) => {
      const userInfo = req.body;

      const token = jwt.sign(userInfo, process.env.JWT_ACCESS_SECRET, {
        expiresIn: "2h",
      });

      res.cookie("token", token, {
        httpOnly: true,
        secure: false,
      });

      res.send({ success: true });
    });

    // 🔹 GET all events
    app.get("/events", async (req, res) => {
      try {
        const { email } = req.query;

        if (!email) {
          return res
            .status(400)
            .json({ error: "Email query param is required" });
        }

        const events = await eventsCollection.find({ email: email }).toArray();

        res.status(200).json(events);
      } catch (err) {
        console.error("Error fetching events:", err);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    app.get("/all/events", async (req, res) => {
      const events = await eventsCollection.find().toArray();
      res.send(events);
    });

    // 🔹 GET single event by ID
    app.get("/events/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const event = await eventsCollection.findOne({ _id: new ObjectId(id) });
        if (!event) return res.status(404).json({ message: "Event not found" });
        res.status(200).json(event);
      } catch (err) {
        res.status(500).json({ error: "Invalid ID format" });
      }
    });

    // 🔹 POST new event
    app.post("/events", verifyToken, async (req, res) => {
      const {
        recurrence,
        recurrencePattern,
        recurrenceCount = 1,
        ...eventData
      } = req.body;
      console.log(req.body);

      const eventsToInsert = [];

      const startDate = new Date(eventData.start);
      const endDate = new Date(eventData.end);

      const now = new Date();
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0); // last day of current month

      if (recurrence === "week") {
        if (recurrencePattern === "daily") {
          // ✅ Your current style → add every day for 7 days
          let current = new Date(startDate);

          for (let i = 0; i < 7; i++) {
            if (current < now) {
              current.setDate(current.getDate() + 1);
              continue;
            }

            const start = new Date(current);
            const end = new Date(current);
            end.setHours(endDate.getHours(), endDate.getMinutes(), 0);

            eventsToInsert.push({
              ...eventData,
              start,
              end,
            });

            current.setDate(current.getDate() + 1);
          }
        } else if (recurrencePattern === "sameDay") {
          // ✅ My style → recur on same day-of-week for X weeks
          let current = new Date(startDate);

          for (let i = 0; i < recurrenceCount; i++) {
            if (current < now) {
              current.setDate(current.getDate() + 7);
              continue;
            }

            const start = new Date(current);
            const end = new Date(current);
            end.setHours(endDate.getHours(), endDate.getMinutes(), 0);

            eventsToInsert.push({
              ...eventData,
              start,
              end,
            });

            current.setDate(current.getDate() + 7);
          }
        }
      } else if (recurrence === "month") {
        if (recurrencePattern === "daily") {
          // add every day from startDate to end of this month
          let current = new Date(startDate);

          while (current <= monthEnd) {
            if (current < now) {
              current.setDate(current.getDate() + 1);
              continue;
            }

            const start = new Date(current);
            const end = new Date(current);
            end.setHours(endDate.getHours(), endDate.getMinutes(), 0);

            eventsToInsert.push({
              ...eventData,
              start,
              end,
            });

            current.setDate(current.getDate() + 1);
          }
        } else if (recurrencePattern === "sameDay") {
          // recur on same day-of-month for X months
          let current = new Date(startDate);

          for (let i = 0; i < recurrenceCount; i++) {
            if (current < now) {
              current.setMonth(current.getMonth() + 1);
              continue;
            }

            const start = new Date(current);
            const end = new Date(current);
            end.setHours(endDate.getHours(), endDate.getMinutes(), 0);

            eventsToInsert.push({
              ...eventData,
              start,
              end,
            });

            current.setMonth(current.getMonth() + 1);
          }
        }
      } else {
        // Non-recurring: just insert once
        eventsToInsert.push(eventData);
      }

      if (eventsToInsert.length === 0) {
        return res.status(400).json({ message: "No events to insert" });
      }

      const result = await eventsCollection.insertMany(eventsToInsert);
      console.log({ success: result });
      res.status(201).json({
        insertedCount: result.insertedCount,
        insertedIds: result.insertedIds,
      });
    });

    // 🔹 PATCH (partial update) event
    app.patch("/events/:id", async (req, res) => {
      try {
        const id = req.params.id;

        // Validate ObjectId
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid ID format" });
        }

        // Exclude _id from updates if present in body
        const { _id, ...updates } = req.body;

        if (Object.keys(updates).length === 0) {
          return res
            .status(400)
            .json({ message: "No fields provided to update" });
        }

        const result = await eventsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updates }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Event not found" });
        }

        res.status(200).json({ message: "Event updated successfully" });
      } catch (error) {
        console.error("Error patching event:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.put("/events/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid ID format" });
        }

        const { _id, ...updatedData } = req.body;

        const result = await eventsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Event not found" });
        }

        res.status(200).json({ message: "Event updated successfully" });
      } catch (error) {
        console.error("Error updating event:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // 🔹 DELETE event
    app.delete("/events/:id", async (req, res) => {
      const id = req.params.id;
      const result = await eventsCollection.deleteOne({
        _id: new ObjectId(id),
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({ message: "Event not found" });
      }

      res.status(200).json({ message: "Event deleted successfully" });
    });

    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("vroom vroom 🏎️");
});

app.listen(port, () => {
  console.log(`🚀 Server is active on port ${port}`);
});
