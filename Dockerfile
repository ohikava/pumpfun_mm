# Use an official Node.js runtime as a parent image
FROM node:16

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./
COPY wallets.txt ./
# Install project dependencies
RUN npm install

# Copy the rest of the application code to the working directory
COPY . .

# Install TypeScript globally
RUN npm install -g typescript

# Compile the TypeScript code
RUN tsc

# Specify the command to run the application
CMD ["node", "dist/main.js"]
