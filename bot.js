require("dotenv").config();
const nodemailer = require("nodemailer");
const cron = require("node-cron");

// Email configuration
const transporter = nodemailer.createTransport({
	service: "gmail", // Change this according to your email service
	auth: {
		user: process.env.EMAIL_USER,
		pass: process.env.EMAIL_APP_PASSWORD,
	},
});

// Function to send email report
async function sendEmailReport(statuses) {
	console.log("Starting email report preparation...");

	// Create HTML content
	let htmlContent = `
		<html>
		<head>
			<style>
				body {
					font-family: Arial, sans-serif;
					line-height: 1.6;
					color: #333;
					max-width: 800px;
					margin: 0 auto;
					padding: 20px;
				}
				.header {
					text-align: center;
					padding: 20px;
					background: #f8f9fa;
					border-radius: 10px;
					margin-bottom: 20px;
				}
				.wallet-card {
					border: 1px solid #ddd;
					border-radius: 8px;
					padding: 15px;
					margin-bottom: 15px;
					background: white;
					box-shadow: 0 2px 4px rgba(0,0,0,0.1);
				}
				.status-active {
					color: #28a745;
					font-weight: bold;
				}
				.status-disconnected {
					color: #dc3545;
					font-weight: bold;
				}
				.status-error {
					color: #ffc107;
					font-weight: bold;
				}
				.etherscan-link {
					color: #007bff;
					text-decoration: none;
				}
				.etherscan-link:hover {
					text-decoration: underline;
				}
				.timestamp {
					color: #6c757d;
					font-size: 0.9em;
					text-align: center;
					margin-top: 20px;
				}
			</style>
		</head>
		<body>
			<div class="header">
				<h1>🔍 WALLET STATUS REPORT 🔍</h1>
				<p>Status update for your monitored wallets</p>
			</div>
	`;

	// Add wallet status cards
	statuses.forEach((status, index) => {
		const statusClass = status.status.includes("✅")
			? "status-active"
			: status.status.includes("❌")
			? "status-disconnected"
			: "status-error";

		htmlContent += `
			<div class="wallet-card">
				<h2>Wallet ${index + 1}</h2>
				<p><strong>Address:</strong> ${status.address}</p>
				<p><strong>Status:</strong> <span class="${statusClass}">${
			status.status
		}</span></p>
				<p><strong>Last Checkpoint:</strong> ${status.lastCheckpoint} ago</p>
				<p><a href="https://sepolia.etherscan.io/address/${status.address}" 
					  class="etherscan-link" 
					  target="_blank">View on Etherscan →</a></p>
			</div>
		`;
	});

	// Add timestamp and close HTML
	htmlContent += `
			<div class="timestamp">
				Report generated on ${new Date().toLocaleString()}
			</div>
		</body>
		</html>
	`;

	// Create plain text content as fallback
	let textContent = "🔍 WALLET STATUS REPORT 🔍\n\n";
	statuses.forEach((status, index) => {
		textContent += `${index + 1}. ${status.address}\n`;
		textContent += `Status: ${status.status}\n`;
		textContent += `Last Checkpoint: ${status.lastCheckpoint} ago\n`;
		textContent += `Etherscan: https://sepolia.etherscan.io/address/${status.address}\n\n`;
	});

	// Get list of recipients from environment variable
	console.log("Parsing email recipients from environment...");
	let recipients;
	try {
		recipients = process.env.EMAIL_RECIPIENTS
			? JSON.parse(process.env.EMAIL_RECIPIENTS)
			: [];
		console.log(
			`Found ${recipients.length} recipients: ${recipients.join(", ")}`
		);
	} catch (error) {
		console.error("Error parsing EMAIL_RECIPIENTS:", error);
		console.error("EMAIL_RECIPIENTS value:", process.env.EMAIL_RECIPIENTS);
		return;
	}

	if (recipients.length === 0) {
		console.error("No email recipients configured in EMAIL_RECIPIENTS");
		return;
	}

	// Log email configuration
	console.log("Email configuration:");
	console.log("- From:", process.env.EMAIL_USER);
	console.log("- SMTP Service:", transporter.options.service);
	console.log("- Auth User:", transporter.options.auth.user);
	console.log(
		"- Auth Pass:",
		process.env.EMAIL_APP_PASSWORD ? "(configured)" : "(missing)"
	);

	const mailOptions = {
		from: process.env.EMAIL_USER,
		to: recipients.join(", "), // Join all recipients with comma
		subject: "🤖 Hourly Node Status Report",
		text: textContent, // Fallback plain text
		html: htmlContent, // HTML version
	};

	console.log("\nAttempting to send email...");
	try {
		const info = await transporter.sendMail(mailOptions);
		console.log("Email sent successfully!");
		console.log("Message ID:", info.messageId);
		console.log("Response:", info.response);
		console.log(`Delivered to ${recipients.length} recipients`);
	} catch (error) {
		console.error("Error sending email:");
		console.error("- Error name:", error.name);
		console.error("- Error message:", error.message);
		console.error("- Error code:", error.code);
		console.error("- Error command:", error.command);
		if (error.response) console.error("- SMTP Response:", error.response);

		// Check common configuration issues
		if (!process.env.EMAIL_USER)
			console.error("EMAIL_USER is not configured in .env");
		if (!process.env.EMAIL_APP_PASSWORD)
			console.error("EMAIL_APP_PASSWORD is not configured in .env");

		throw error; // Re-throw to be caught by the cron job error handler
	}
}

// Schedule hourly status check and email with error handling
cron.schedule("0 * * * *", async () => {
	try {
		console.log("\n=== Starting scheduled status check ===");
		console.log("Time:", new Date().toISOString());
		const statuses = await checkWalletStatuses();
		await sendEmailReport(statuses);
		console.log("=== Scheduled task completed ===\n");
	} catch (error) {
		console.error("Failed to complete scheduled task:", error);
	}
});

// Run initial status check with error handling
console.log("\n=== Running initial status check ===");
checkWalletStatuses()
	.then(async (statuses) => {
		console.log("Initial status check completed");
		try {
			await sendEmailReport(statuses);
		} catch (error) {
			console.error("Failed to send initial email report:", error);
		}
	})
	.catch((error) => {
		console.error("Error in initial status check:", error);
	});

async function checkWalletStatuses() {
	const addresses = process.env.ADDRESSES;

	if (!addresses) {
		console.error("ADDRESSES is not defined or is empty in .env");
		return "No wallet addresses configured";
	}

	let parsedAddresses;
	try {
		parsedAddresses = JSON.parse(addresses);
	} catch (error) {
		console.error("Error parsing ADDRESSES:", error);
		return "Invalid wallet addresses format";
	}

	const statuses = [];

	for (const [index, address] of parsedAddresses.entries()) {
		const url = `https://api-sepolia.etherscan.io/api?module=account&action=txlist&address=${address}&page=1&offset=1&sort=desc&apikey=${process.env.ETHERSCAN_API_KEY}`;

		let data;
		try {
			await new Promise((resolve) => setTimeout(resolve, 1000));

			const response = await fetch(url);
			data = await response.json();
		} catch (error) {
			console.error("Error fetching data:", error);
			statuses.push({
				address: address,
				status: "❌ Error",
			});
			continue;
		}

		const transactions = data.result || [];
		let status = "❌ Disconnected";
		if (transactions.length > 0) {
			const lastTransactionTime = parseInt(transactions[0].timeStamp);

			const timeDiff = getTimeDifference(lastTransactionTime);

			console.log(`Time Difference: ${timeDiff} hours`);

			if (timeDiff <= 1.2) {
				status = "✅ Active";
			}
		}

		const lastCheckpointTime =
			transactions.length > 0
				? getTimeDifference(transactions[0].timeStamp)
				: null;
		const lastCheckpointReadable = lastCheckpointTime
			? lastCheckpointTime < 5 / 60
				? "less than a minute"
				: lastCheckpointTime < 24
				? `${(lastCheckpointTime * 60).toFixed(0)} minutes`
				: `${(lastCheckpointTime / 24).toFixed(2)} days`
			: "No checkpoints";

		statuses.push({
			address: address,
			status: status,
			lastCheckpoint: lastCheckpointReadable,
		});
	}

	console.log("🔍 WALLET STATUS REPORT 🔍");
	statuses.forEach((status, index) => {
		console.log(`${index + 1}. ${status.address}`);
		console.log(`Status: ${status.status}`);
		console.log(`Last Checkpoint: ${status.lastCheckpoint} ago`);
		console.log(
			`Etherscan: https://sepolia.etherscan.io/address/${status.address}`
		);
		console.log("");
	});

	return statuses;
}

async function getCheckpoints() {
	const addresses = process.env.ADDRESSES;

	if (!addresses) {
		console.error("ADDRESSES is not defined or is empty in .env");
		return "No wallet addresses configured";
	}

	let parsedAddresses;
	try {
		parsedAddresses = JSON.parse(addresses);
	} catch (error) {
		console.error("Error parsing ADDRESSES:", error);
		return "Invalid wallet addresses format";
	}

	const checkpoints = [];
	const emojis = [
		"🤖",
		"👽",
		"👻",
		"🐶",
		"🐱",
		"🐭",
		"🐹",
		"🚀",
		"👾",
		"🦾",
		"🧨",
		"🎃",
		"🐰",
		"🦊",
		"⭐",
		"🌟",
		"✨",
		"⚡",
		"🔥",
		"💥",
		"☃️",
		"🌸",
	];

	for (const address of parsedAddresses) {
		const url = `https://api-sepolia.etherscan.io/api?module=account&action=txlist&address=${address}&page=1&offset=2000&startblock=7852278&sort=desc&apikey=${process.env.ETHERSCAN_API_KEY}`;

		let data;
		try {
			await new Promise((resolve) => setTimeout(resolve, 1000));

			const response = await fetch(url);
			data = await response.json();
		} catch (error) {
			console.error("Error fetching data:", error);
			continue;
		}

		const totalCheckpoints = data.result.length;
		const lastCheckpointTimestamp =
			data.result.length > 0 ? data.result[0].timeStamp : null;
		const lastCheckpointTime = lastCheckpointTimestamp
			? getTimeDifference(lastCheckpointTimestamp)
			: null;
		const lastCheckpointReadable = lastCheckpointTime
			? lastCheckpointTime < 5 / 60
				? "less than a minute"
				: lastCheckpointTime < 24
				? `${(lastCheckpointTime * 60).toFixed(0)} minutes`
				: `${(lastCheckpointTime / 24).toFixed(2)} days`
			: "No checkpoints";
		const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

		checkpoints.push({
			address,
			checkpoints: totalCheckpoints,
			lastCheckpoint: {
				time: lastCheckpointReadable,
			},
			emoji: randomEmoji,
		});
	}

	console.log("🔍 CHECKPOINTS REPORT 🔍");
	checkpoints.forEach((checkpoint, index) => {
		console.log(`${index + 1}. ${checkpoint.address}`);
		console.log(`Last Recorded: ${checkpoint.lastCheckpoint.time} ago`);
		console.log(
			`${checkpoint.emoji} Checkpoints: ${checkpoint.checkpoints}`
		);
		console.log("");
	});

	return checkpoints;
}

async function getAllCheckpoints() {
	const addresses = process.env.ALL_ADDRESSES;

	if (!addresses) {
		console.error("ALL_ADDRESSES is not defined or is empty in .env");
		return "No wallet addresses configured";
	}

	let parsedAddresses;
	try {
		// Trim whitespace and ensure proper JSON format
		const cleanedAddresses = addresses.trim();
		parsedAddresses = JSON.parse(cleanedAddresses);
	} catch (error) {
		console.error("Error parsing ALL_ADDRESSES:", error);
		// More descriptive error message
		return "Invalid wallet addresses format. Please check the ALL_ADDRESSES format in your .env file.";
	}

	let totalCheckpointsCount = 0;
	let processedAddresses = 0;

	for (const address of parsedAddresses) {
		// Validate address format before making API call
		if (
			!address ||
			typeof address !== "string" ||
			!address.match(/^0x[a-fA-F0-9]{40}$/)
		) {
			console.error(`Invalid address format: ${address}`);
			continue;
		}

		const url = `https://api-sepolia.etherscan.io/api?module=account&action=txlist&address=${address}&page=1&offset=2000&startblock=7852278&sort=desc&apikey=${process.env.ETHERSCAN_API_KEY}`;

		let data;
		try {
			await new Promise((resolve) => setTimeout(resolve, 1000));

			const response = await fetch(url);
			data = await response.json();

			if (data.status !== "1") {
				console.error(
					`API error for address ${address}: ${data.message}`
				);
				continue;
			}

			const addressCheckpoints = data.result.length;
			totalCheckpointsCount += addressCheckpoints;
			processedAddresses++;
		} catch (error) {
			console.error(`Error fetching data for address ${address}:`, error);
			continue;
		}
	}

	console.log("🔍 CHECKPOINTS REPORT 🔍");
	console.log(`Total Checkpoints: ${totalCheckpointsCount}`);
	console.log(
		`Processed Addresses: ${processedAddresses}/${parsedAddresses.length}`
	);
	console.log("");

	return {
		totalCheckpoints: totalCheckpointsCount,
		processedAddresses,
		totalAddresses: parsedAddresses.length,
	};
}

function getTimeDifference(transactionTimestamp) {
	const now = new Date();
	const currentUnixTimestamp = now.getTime() / 1000;

	const transactionUnixTimestamp = transactionTimestamp;

	const timeDiff = (currentUnixTimestamp - transactionUnixTimestamp) / 3600;
	return timeDiff;
}

// Run initial status check
checkWalletStatuses().then(() => {
	console.log("Initial status check completed");
});

// Set up recurring status check
const checkInterval = 3600000; // 1 hour in milliseconds
setInterval(async () => {
	try {
		await checkWalletStatuses();
		console.log(
			`Status check completed at ${new Date().toLocaleTimeString()}`
		);
	} catch (error) {
		console.error("Error performing hourly update:", error);
	}
}, checkInterval);

// Export functions for use in other scripts if needed
module.exports = {
	checkWalletStatuses,
	getCheckpoints,
	getAllCheckpoints,
};
