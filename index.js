const express = require("express");
const ObjectId = require("mongodb").ObjectId;
const admin = require("firebase-admin");
const app = express();
const cors = require("cors");
require("dotenv").config();
const { MongoClient } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_KEY);

const port = process.env.PORT || 5000;
// niche-products-2f8e9-firebase-admins.json

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
// middle ware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.aubya.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function verifyToken(req, res, next) {
  if (req.headers.authorization.startsWith("Bearer ")) {
    const token = req.headers.authorization.split(" ")[1];
    try {
      const decodedUser = await admin.auth().verifyIdToken(token);
      req.decodedEmail = decodedUser.email;
    } catch {}
  }
  next();
}

async function run() {
  try {
    await client.connect();
    const database = client.db("sunglass_shopDB");
    const productCollection = database.collection("products");
    const orderCollection = database.collection("orders");
    const usersCollection = database.collection("users");
    const reviewCollection = database.collection("reviews");
    //  post api Add a product
    app.post("/products", async (req, res) => {
      const body = req.body;
      //  console.log(body)
      const result = await productCollection.insertOne(body);
      console.log(result);
      res.send(result);
    });
    //  get api & get all product from db
    app.get("/products", async (req, res) => {
      const result = await productCollection.find({}).toArray();
      res.send(result);
    });
    //get single data for purchase order page
    app.get("/products/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await productCollection.findOne(filter);
      res.send(result);
    });
    //Post orders from customer
    app.post("/orders", async (req, res) => {
      const body = req.body;
      // console.log(body);
      const result = await orderCollection.insertOne(body);
      // console.log(result)
      res.json(result);
    });

    //post api from useFirebase hooks to store userInfo in database
    app.post("/users", async (req, res) => {
      const user = req.body;
      // console.log(user);
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    //if the email already exist in db users Collection we use upsart api

    app.put("/users", async (req, res) => {
      const user = req.body;
      const email = req.body.email;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = { $set: user };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      console.log(result);
      res.send(result);
    });
    //make a admin using put method
    app.put("/users/admin", verifyToken, async (req, res) => {
      const email = req.body.email;
      const requester = req.decodedEmail;
      if (requester) {
        const requesterAccount = await usersCollection.findOne({
          email: requester,
        });
        if (requesterAccount.role === "admin") {
          const filter = { email: email };
          const updateDoc = { $set: { role: "admin" } };
          const result = await usersCollection.updateOne(filter, updateDoc);
          res.send(result);
        }
      } else {
        res.status(403).json({ message: "You dont have access" });
      }
    });
    // check if the user is admin or not using get api with email
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const user = await usersCollection.findOne(filter);
      let isAdmin = false;
      if (user?.role === "admin") {
        isAdmin = true;
      }
      res.send({ admin: isAdmin });
    });
    //get my order quary with email from orderCollection
    app.get("/orders", async (req, res) => {
      const email = req.query.email;
      //  console.log(email);
      const filter = { email: email };
      const result = await orderCollection.find(filter).toArray();
      res.send(result);
    });
    //cancel order from my order using  delete api
    app.delete("/orders/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await orderCollection.deleteOne(filter);
      res.send(result);
    });
    //manageAll orders using get api from OrderCollection
    app.get("/manage", async (req, res) => {
      const result = await orderCollection.find({}).toArray();
      res.send(result);
    });
    //update status of order from admin panel using put api
    app.put("/status/:id", async (req, res) => {
      const status = req.body.status;
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const updateDoc = { $set: { status: status } };
      const result = await orderCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    // delete order from manageorder page
    app.delete("/manage/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await orderCollection.deleteOne(filter);
      console.log(result);
      res.send(result);
    });
    // delete api for manage products admin can delete any product from product collection
    app.delete("/products/:id", async (req, res) => {
      const id = req.params.id;
      //  console.log(id);
      const filter = { _id: ObjectId(id) };
      const result = await productCollection.deleteOne(filter);
      //  console.log(result);
      res.send(result);
    });

    // review get api from customers review
    app.get("/review", async (req, res) => {
      const result = await reviewCollection.find({}).toArray();
      res.json(result);
    });

    // post review from  add review
    app.post("/review", async (req, res) => {
      const body = req.body;
      const result = await reviewCollection.insertOne(body);
      res.send(result);
    });

    // for payment system

    app.get("/orders/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await orderCollection.findOne(filter);
      res.send(result);
    });

    app.post("/create-payment-intent", async (req, res) => {
      const paymentInfo = req.body;
      const amount = paymentInfo.price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    //update oreder for payment
    app.put("/orders/:id", async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = { $set: { payment: payment } };
      const result = await orderCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });
  } finally {
    //    await client.close()
  }
}
run().catch(console.dir);

//
app.get("/", (req, res) => {
  //   console.log("hello sunglassShop");
  res.send("hello from sunglassShopBd");
});
app.listen(port, () => {
  console.log("listening on port ", port);
});
