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
		client.hget(
			`user:${req.session.userid}`,
			"username",
			(err, currentUserName) => {
				client.smembers(`following:${currentUserName}`, (err, following) => {
					client.hkeys("users", (err, users) => {
						res.render("dashboard", {
							users: users.filter(
								user =>
									user !== currentUserName && following.indexOf(user) === -1
							),
						});
					});
				});
			}
		);
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
			try {
				client.hset("users", username, userid);

				const saltRounds = 10;
				const hash = await bcrypt.hash(password, saltRounds);

				client.hmset(`user:${userid}`, "hash", hash, "username", username);

				saveSessionAndRenderDashboard(userid);
			} catch (err) {
				console.error(err);
			}
		});
	};

	const handleSignIn = (userid, password) => {
		client.hget(`user:${userid}`, "hash", async (err, hash) => {
			try {
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
			} catch (err) {
				console.error(err);
			}
		});
	};

	const saveSessionAndRenderDashboard = userid => {
		req.session.userid = userid;
		req.session.save();
		client.hkeys("users", (err, users) => {
			res.render("dashboard", { users: users });
		});
	};

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

app.get("/post", (req, res) => {
	if (req.session.userid) {
		res.render("post");
	} else {
		res.render("login");
	}
});

app.post("/post", (req, res) => {
	if (!req.session.userid) {
		res.render("login");
	}

	const { message } = req.body;

	client.incr("postid", async (err, postid) => {
		try {
			client.hmset(
				`post:${postid}`,
				"userid",
				req.session.userid,
				"message",
				message,
				"timestamp",
				Date.now()
			);

			res.render("dashboard");
		} catch (err) {
			console.error(err);
		}
	});
});

app.post("/follow", (req, res) => {
	if (!req.session.userid) {
		res.render("login");
		return;
	}

	const { username } = req.body;

	client.hget(
		`user:${req.session.userid}`,
		"username",
		(err, currentUserName) => {
			try {
				client.sadd(`following:${currentUserName}`, username);
				client.sadd(`followers:${username}`, currentUserName);
			} catch (err) {
				console.error(err);
			}
		}
	);

	res.redirect("/");
});

const port = 3000;
app.listen(port, (req, res) => {
	console.log(`Server running in port ${port}`);
});
