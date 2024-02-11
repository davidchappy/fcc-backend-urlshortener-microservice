require("dotenv").config()
const express = require("express")
const cors = require("cors")
const app = express()
const mongoose = require("mongoose")
const dns = require("dns")

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => {
    console.log("MongoDB connected successfully.")
    initializeCounter("urls")
  })
  .catch(err => console.error("MongoDB connection error:", err))

async function initializeCounter(collectionName) {
  try {
    const counterExists = await Counter.findById(collectionName)
    if (!counterExists) {
      const newCounter = new Counter({ _id: collectionName, seq: 0 })
      await newCounter.save()
      console.log(`Counter for ${collectionName} initialized.`)
    } else {
      console.log(`Counter for ${collectionName} already exists.`)
    }
  } catch (error) {
    console.error(`Error initializing counter for ${collectionName}:`, error)
    throw error // Rethrow or handle as needed
  }
}

const counterSchema = new mongoose.Schema({
  _id: String, // Name of the collection for which the count is maintained
  seq: { type: Number, default: 0 } // Name of the collection for which the count is maintained
})

const Counter = mongoose.model("Counter", counterSchema)

const urlSchema = new mongoose.Schema({
  originalURL: {
    type: String,
    required: true
  },
  shortURL: {
    type: Number,
    index: true,
    required: true
  }
})

const URLModel = mongoose.model("URLs", urlSchema)

// Basic Configuration
const port = process.env.PORT || 3000

app.use(cors())
app.use(express.urlencoded({ extended: true }))

app.use("/public", express.static(`${process.cwd()}/public`))

app.get("/", function (req, res) {
  res.sendFile(process.cwd() + "/views/index.html")
})

// Your first API endpoint
app.get("/api/hello", function (req, res) {
  res.json({ greeting: "hello API" })
})

const handleCreateShortURL = async url => {
  console.log("handleCreateShortURL", url)
  try {
    const existingURLDoc = await URLModel.findOne({ originalURL: url })

    console.log({ existingURLDoc })

    if (existingURLDoc) return existingURLDoc

    const update = { $inc: { seq: 1 } }
    const options = { new: true, upsert: true, setDefaultsOnInsert: true }
    const counter = await Counter.findByIdAndUpdate("urls", update, options)

    return await URLModel.create({
      originalURL: url,
      shortURL: counter.seq
    })
  } catch (err) {
    throw err // Rethrow the error and let the caller handle it
  }
}

const validateURL = async url => {
  const urlPattern = new RegExp(
    "^(https?:\\/\\/)?" + // protocol
      "((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|" + // domain name
      "((\\d{1,3}\\.){3}\\d{1,3}))" + // OR ip (v4) address
      "(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*" + // port and path
      "(\\?[;&a-z\\d%_.~+=-]*)?" + // query string
      "(\\#[-a-z\\d_]*)?$", // fragment locator
    "i"
  )

  return new Promise((resolve, reject) => {
    if (!urlPattern.test(url)) {
      reject(new Error("Invalid URL format"))
    }

    try {
      const { hostname } = new URL(url)
      dns.lookup(hostname, (err, addresses) => {
        if (err) {
          console.log("DNS lookup error:", err)
          reject(new Error("DNS lookup failed"))
        } else {
          resolve(addresses)
        }
      })
    } catch (err) {
      console.log("Error in validateURL:", err)
      reject(new Error("Invalid URL format"))
    }
  })
}

app.post("/api/shorturl", async function (req, res, next) {
  const { url } = req?.body || {}

  if (!url) {
    const warningMessage = encodeURIComponent("URL field was empty.")
    res.redirect(`/?message=${warningMessage}`)
    return
  }

  try {
    await validateURL(url)

    const created = await handleCreateShortURL(url)
    res.json({
      original_url: created.originalURL,
      short_url: created.shortURL
    })
  } catch (err) {
    console.error("Error stack: ", err.stack)
    return res.status(400).json({
      error: "Invalid URL or internal server error"
    })
  }
})

app.get("/api/shorturl/:shorturl", async (req, res) => {
  // get short url id from params
  const { shorturl } = req.params

  // find URL doc by shorturl
  const urlDoc = await URLModel.findOne({
    shortURL: shorturl
  })

  if (!urlDoc) {
    res.json({
      error: "No short URL found for the given input"
    })
  } else {
    res.redirect(urlDoc.originalURL)
  }
})

app.listen(port, function () {
  console.log(`Listening on port ${port}`)
})
