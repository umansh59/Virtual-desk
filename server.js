const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let queue = [];
let currentChatUser = null; // Variable to store the user currently chatting with admin
let messages = {}; // Object to store message history for each user

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // User joins the queue
    socket.on('joinQueue', () => {
        if (queue.includes(socket.id) || socket.id === currentChatUser) {
            socket.emit('alreadyInQueue');
        } else {
            queue.push(socket.id);
            socket.emit('queuePosition', queue.length);
            console.log(`User ${socket.id} joined the queue.`);
            io.emit('queueUpdate', queue);
        }
    });

    // Admin requests to start chat with the next user
    socket.on('requestNext', () => {
        if (queue.length > 0) {
            if (currentChatUser) {
                // Notify the previous chat user that they are no longer in chat
                io.to(currentChatUser).emit('chatEnded', 'Your chat session has ended. Please rejoin the queue if you need further assistance.');
            }
            currentChatUser = queue.shift();
            io.to(currentChatUser).emit('startChat');
            io.emit('queueUpdate', queue);
            console.log(`User ${currentChatUser} is now chatting with admin.`);

            // Send the message history to the admin for the current user
            if (messages[currentChatUser]) {
                io.to(socket.id).emit('messageHistory', messages[currentChatUser]);
            }
        }
    });

    // Admin sends a message to the current user
    socket.on('adminMessage', (message) => {
        if (currentChatUser) {
            io.to(currentChatUser).emit('receiveMessage', { sender: 'Admin', message });
            console.log(`Admin to ${currentChatUser}: ${message}`);

            // Save the message in history for admin's visibility
            if (!messages[currentChatUser]) {
                messages[currentChatUser] = [];
            }
            messages[currentChatUser].push({ sender: 'Admin', message });
        }
    });

    // User sends a message to the admin
    socket.on('userMessage', (message) => {
        if (currentChatUser === socket.id) {
            // Send the message only to the user, not to others
            io.to(socket.id).emit('receiveMessage', { sender: `User ${socket.id}`, message });
            console.log(`User ${socket.id} to Admin: ${message}`);

            // Save the message in history only for the admin's visibility
            if (!messages[socket.id]) {
                messages[socket.id] = [];
            }
            messages[socket.id].push({ sender: `User ${socket.id}`, message });
        } else {
            socket.emit('notInChat', 'You are not currently chatting with the admin. Please rejoin the queue.');
        }
    });

    // Admin forcibly removes a user from the queue
    socket.on('removeFromQueue', (userId) => {
        queue = queue.filter(id => id !== userId);
        io.to(userId).emit('removedFromQueue');
        io.emit('queueUpdate', queue);
        console.log(`User ${userId} was removed from the queue by admin.`);
    });

    // User disconnects and is automatically removed from the queue
    socket.on('disconnect', () => {
        queue = queue.filter(id => id !== socket.id);
        if (currentChatUser === socket.id) {
            currentChatUser = null; // Clear the current chat user if they disconnect
        }
        io.emit('queueUpdate', queue);
        console.log(`User ${socket.id} disconnected and was removed from the queue.`);
    });
});

// Serve the main client and admin pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

server.listen(3000, () => {
    console.log('Server is listening on port 3000');
});
