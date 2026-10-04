const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;

// اطلاعات فقط در حافظه هستند.
// با خاموش شدن/ری‌استارت سرور از بین می‌روند.
const users = new Map();

let nextUserNumber = 2;

const server = http.createServer((req, res) => {
    if (req.url === "/") {
        res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8"
        });

        res.end("Anonymous Chat Server is running");
        return;
    }

    res.writeHead(404);
    res.end("Not Found");
});

const wss = new WebSocket.Server({
    server: server
});

function sendToAll(data) {
    const message = JSON.stringify(data);

    for (const user of users.values()) {
        if (user.socket.readyState === WebSocket.OPEN) {
            user.socket.send(message);
        }
    }
}

function sendToUser(user, data) {
    if (user && user.socket.readyState === WebSocket.OPEN) {
        user.socket.send(JSON.stringify(data));
    }
}

function removeUser(user) {
    if (!user) return;

    users.delete(user.number);

    sendToAll({
        type: "system",
        message: "کاربر " + user.number + " از چت خارج شد"
    });
}

wss.on("connection", (socket, request) => {

    const ip = request.socket.remoteAddress;

    const user = {
        number: nextUserNumber++,
        socket: socket,
        ip: ip,
        isAdmin: false
    };

    users.set(user.number, user);

    // فقط اطلاعات لازم برای خود کاربر
    sendToUser(user, {
        type: "welcome",
        userNumber: user.number
    });

    // اطلاع ورود به همه
    sendToAll({
        type: "system",
        message: "خوش آمدید کاربر " + user.number
    });

    socket.on("message", (rawMessage) => {

        let data;

        try {
            data = JSON.parse(rawMessage.toString());
        } catch (error) {
            return;
        }

        // ورود مدیر با رمز از متغیر محیطی سرور
        if (data.type === "admin_login") {

            const adminPassword = process.env.ADMIN_PASSWORD;

            if (
                adminPassword &&
                data.password === adminPassword
            ) {
                user.isAdmin = true;

                sendToUser(user, {
                    type: "admin_login_success"
                });
            }

            return;
        }

        // پیام عمومی
        if (data.type === "message") {

            const text = String(data.message || "").trim();

            if (text.length === 0 || text.length > 1000) {
                return;
            }

            sendToAll({
                type: "message",
                userNumber: user.number,
                message: text
            });

            return;
        }

        // پیام خصوصی مدیر
        if (data.type === "private_message") {

            if (!user.isAdmin) {
                return;
            }

            const targetNumber = Number(data.targetUser);
            const text = String(data.message || "").trim();

            if (
                !Number.isInteger(targetNumber) ||
                text.length === 0 ||
                text.length > 1000
            ) {
                return;
            }

            const targetUser = users.get(targetNumber);

            if (!targetUser) {
                sendToUser(user, {
                    type: "error",
                    message: "کاربر مورد نظر آنلاین نیست"
                });

                return;
            }

            sendToUser(targetUser, {
                type: "private_message",
                from: 1,
                message: text
            });

            return;
        }

        // پایان چت توسط مدیر
        if (data.type === "end_chat") {

            if (!user.isAdmin) {
                return;
            }

            sendToAll({
                type: "chat_ended",
                message: "چت به پایان رسید"
            });

            // حذف اطلاعات کاربران از حافظه
            users.clear();

            nextUserNumber = 2;

            return;
        }
    });

    socket.on("close", () => {
        removeUser(user);
    });

    socket.on("error", () => {
        removeUser(user);
    });
});

server.listen(PORT, () => {
    console.log("Anonymous Chat Server running on port " + PORT);
});
