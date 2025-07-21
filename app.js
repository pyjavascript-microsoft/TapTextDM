const socket = io();

socket.on("dm", ({ from, to, message, timestamp }) => {
  console.log(`[${timestamp}] ${from} to ${to}: ${message}`);
});