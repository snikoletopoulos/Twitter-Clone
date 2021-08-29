require("dotenv").config();
const express = require("express");
const path = require("path");
const redis = require("redis");
const bcrypt = require("bcrypt");
const session = require("express-session");
const RedisStore = require("connect-redis")(session);

const client = redis.createClient();

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(
	session({
		store: new RedisStore({ client: client }),
		resave: true,
		saveUninitialized: true,
		cookie: {
			maxAge: 36000000,
			httpOnly: false,
			secure: false,
		},
		secret: "bM80SARMxlq4fiWhulfNSeUFURWLTY8vyf",
	})
);

app.get("/", (req, res) => {
	if (req.session.userid) {
		res.render("dashboard");
	} else {
		res.render("login");
	}
});

app.post("/", async (req, res) => {
	const { username, password } = req.body;

	if (!username || !password) {
		res.render("error", {
			message: "Please se both username and password.",
		});
		return;
	}

	// Functions
	const handleSignUp = async (username, password) => {
		client.incr("userid", async (err, userid) => {
			client.hset("users", username, userid);

			const saltRounds = 10;
			const hash = await bcrypt.hash(password, saltRounds);

			client.hset(`user:${userid}`, "hash", hash, "username", username);

			saveSessionAndRenderDashboard(userid);
		});
	};

	const handleSignIn = (userid, password) => {
		client.hget(`user:${userid}`, "hash", async (err, hash) => {
			const result = await bcrypt.compare(password, hash);
			if (result) {
				// Password correct
				saveSessionAndRenderDashboard(userid);
			} else {
				// Password incorect
				res.render("error", {
					message: "Incorrect password",
				});
				return;
			}
		});
	};

	const saveSessionAndRenderDashboard = userid => {
		req.session.userid = userid;
		req.session.save();
		res.render("dashboard");
	};

	console.log(req.body, username, password);

	client.hget("users", username, (err, userId) => {
		if (!userId) {
			// Sign Up process
			handleSignUp(username, password);
		} else {
			// Sign in process
			handleSignIn(userId, password);
		}
	});
});

const port = 3000;
app.listen(port, (req, res) => {
	console.log(`Server running in port ${port}`);
});

app.get("/post", (req, res) => {
	if (req.session.userid) {
		res.render("post");
	} else {
		res.render("login");
	}
});
