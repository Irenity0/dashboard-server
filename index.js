require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const morgan = require("morgan");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.5st1jdm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const eventsCollection = client.db("control_panel").collection("events");

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

    app.get("/all/events", async (req,res) => {
      const events = await eventsCollection.find().toArray()
      res.send(events)
    })

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
    app.post("/events", async (req, res) => {
      const newEvent = req.body;
      const result = await eventsCollection.insertOne(newEvent);
      res.status(201).json({ insertedId: result.insertedId });
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
      return res.status(400).json({ message: "No fields provided to update" });
    }

    // Perform partial update using $set
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


    // 🔹 PUT (update) event
    const { ObjectId } = require("mongodb");

    app.put("/events/:id", async (req, res) => {
      try {
        const id = req.params.id;

        // ✅ Check for valid ObjectId
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid ID format" });
        }

        // ✅ Destructure _id out of the update body
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
