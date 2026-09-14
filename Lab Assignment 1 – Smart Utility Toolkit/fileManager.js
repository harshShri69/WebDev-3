
const fs = require("fs");

const fileName = "sample.txt";

fs.writeFile(fileName, "Hello, this is my first file.", (err) => {

    if (err) {
        console.log("Error creating file:", err);
    } else {
        console.log("File created successfully");

        
        fs.readFile(fileName, "utf8", (err, data) => {

            if (err) {
                console.log("Error reading file:", err);
            } else {
                console.log("File content:", data);

                
                fs.appendFile(
                    fileName,
                    "\nThis is updated content.",
                    (err) => {

                        if (err) {
                            console.log("Error updating file:", err);
                        } else {
                            console.log("File updated successfully");

                          
                            fs.readFile(
                                fileName,
                                "utf8",
                                (err, updatedData) => {

                                    if (err) {
                                        console.log(
                                            "Error reading updated file:",
                                            err
                                        );
                                    } else {
                                        console.log(
                                            "Updated content:",
                                            updatedData
                                        );

                                        
                                        fs.unlink(fileName, (err) => {

                                            if (err) {
                                                console.log(
                                                    "Error deleting file:",
                                                    err
                                                );
                                            } else {
                                                console.log(
                                                    "File deleted successfully"
                                                );
                                            }

                                        });
                                    }

                                }
                            );
                        }

                    }
                );
            }

        });
    }

});