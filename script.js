document.addEventListener("DOMContentLoaded", () => {
	let dragOverlay = document.createElement("div")
	dragOverlay.className = "drag-overlay"
	dragOverlay.setAttribute("aria-hidden", "true")
	dragOverlay.innerHTML = `<div>Drop file to convert</div>`
	document.body.appendChild(dragOverlay)

	let fileInput = document.getElementById("xmlFile")
	let fileNameElement = document.getElementById("xmlFileName")
	
	let outputArea = document.getElementById("outputArea")
	let outputCodeElement = document.getElementById("outputCode")
	let copyButton = document.getElementById("copyButton")
	
	let statusElement = document.getElementById("status")
	
	function showStatus(message, type) {
		statusElement.textContent = message
		statusElement.className = `status ${type}`
		statusElement.style.display = "block"
	}
	function clearStatus() {
		statusElement.textContent = ""
		statusElement.style.display = "none"
		statusElement.className = "status"
	}

	function resetCopyButton() {
		let buttonText = copyButton.querySelector("span")
		buttonText.textContent = "Copy"
		copyButton.disabled = false
	}
	copyButton.addEventListener("click", () => {
		if (!outputCodeElement.textContent) return
		
		navigator.clipboard.writeText(outputCodeElement.textContent)
			.then(() => {
				let buttonText = copyButton.querySelector("span")
				let originalText = buttonText.textContent
				buttonText.textContent = "Copied!"
				copyButton.disabled = true
				setTimeout(() => {
					buttonText.textContent = originalText
					copyButton.disabled = false
				}, 1500)
			})
			.catch(err => {
				console.error("Failed to copy text: ", err)
				showStatus("Failed to copy text to clipboard.", "error")
			})
	})
	
	let dragCounter = 0
	document.addEventListener("dragenter", (e) => {
		dragCounter += 1
		dragOverlay.classList.add("visible")
	})
	document.addEventListener("dragover", (e) => {
		e.preventDefault()
	})
	document.addEventListener("dragleave", (e) => {
		dragCounter -= 1
		if (dragCounter == 0) dragOverlay.classList.remove("visible")
	})
	document.addEventListener("drop", (e) => {
		e.preventDefault()
		dragOverlay.classList.remove("visible")
		
		fileInput.files = e.dataTransfer.files
		handleFileSelect({target: fileInput})
	})
	fileInput.addEventListener("change", handleFileSelect)
	function handleFileSelect(event) {
		clearStatus()
		outputArea.style.display = "none"
		
		let file = event.target.files[0]
		if (!file) return
		
		fileNameElement.textContent = file.name
		fileNameElement.title = file.name
		fileNameElement.style.color = "var(--text-color)"
		
		let allowedExtensions = /(\.xml|\.fnt|\.txt)$/i
		if (!allowedExtensions.exec(file.name)) {
			showStatus("Invalid file type — Expected: xml/fnt/txt", "error")
			fileInput.value = ""
			return
		}
		
		let reader = new FileReader()
		
		reader.onload = function(e) {
			try {
				let xmlContent = e.target.result
				let output = convertXMLToLua(xmlContent)
				
				if (output.startsWith("{")) {
					outputCodeElement.textContent = output
					hljs.highlightAll()
					outputArea.style.display = "flex"
					showStatus("Conversion successful!", "success")
					resetCopyButton()
				} else {
					showStatus("", "error")
					statusElement.innerHTML = "Invalid format — Expected: BMFont XML"+
						"\n\n<span style='font-size: 14px;'>"+
						"Error: "+output.replace(/[<>]/g, m => (m === "<" ? "&lt;" : "&gt;"))
						+"</span>"
					outputArea.style.display = "none"
				}
			} catch (error) {
				console.error("Conversion error:", error)
				showStatus(`Error during conversion: ${error.message}. Check console for details.`, "error")
				outputArea.style.display = "none"
			}
		}
		
		reader.onerror = function(e) {
			console.error("File reading error:", e)
			showStatus(`Error reading file: ${e.target.error}`, "error")
			fileNameElement.textContent = `Error reading ${file.name}`
			outputArea.style.display = "none"
		}
		
		reader.readAsText(file)
	}
	
	function convertXMLToLua(xml) {
		xml = xml.replace(/\s+/g, " ").trim()
		
		let extractInteger = (elementString, attribute) => {
			let match = elementString.match(new RegExp(`${attribute}\\s*=\\s*"(-?\\d+)"`))
			return match ? parseInt(match[1], 10) : null
		}
		
		let fontSize = null
		let infoMatch = xml.match(/<info([^>]+)>/)
		if (infoMatch && infoMatch[1]) {
			fontSize = extractInteger(infoMatch[1], "size")
			if (fontSize === null || isNaN(fontSize)) {
				if (!infoMatch[1].match(/face=|charset=|padding=|spacing=/)) {
					return "Invalid <info> element."
				}
				return "Missing or invalid 'size' attribute in <info> element."
			}
		} else {
			return "Missing <info> element."
		}
		
		let characters = []
		let charRegex = /<char([^>]+)\/>/g
		let match = null
		
		while ((match = charRegex.exec(xml)) !== null) {
			let attributes = match[1]
			
			let id = extractInteger(attributes, "id")
			if (id !== null && !isNaN(id)) {
				let width = extractInteger(attributes, "width")
				let height = extractInteger(attributes, "height")
				let x = extractInteger(attributes, "x")
				let y = extractInteger(attributes, "y")
				let xOffset = extractInteger(attributes, "xoffset")
				let yOffset = extractInteger(attributes, "yoffset")
				let xAdvance = extractInteger(attributes, "xadvance")
				
				if ([width, height, x, y, xOffset, yOffset, xAdvance].some(val => val === null || isNaN(val))) {
					return `Character data for ${id} is missing or invalid.`
				}
				
				let char = String.fromCharCode(id)
				let escapedChar = char.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")
				
				characters.push(
					`\t\t["${escapedChar}"] = {${width}, ${height}, Vector2.new(${x}, ${y}), ${xOffset}, ${yOffset}, ${xAdvance}}`
				)
			} else {
				return `Found <char> tag with missing or invalid "id" attribute:\n${match[0]}}`
			}
		}
		
		if (characters.length === 0 && xml.includes("<chars") && xml.includes("count=")) {
			let charsCountMatch = xml.match(/<chars\s+count="(\d+)"/)
			if (charsCountMatch && parseInt(charsCountMatch[1], 10) > 0) {
				return "Found <chars count> indicating characters exist, but couldn't parse any <char .../> elements. Check XML structure."
			} else if (!charsCountMatch) {
				return "Expected <chars count=\"...\"> element, but it was not found or invalid."
			}
		} else if (characters.length === 0 && !xml.includes("<chars")) {
			return "No <char.../> elements found and no <chars count=\"...\"> tag detected."
		}
		
		let output = `{\n\tSize = ${fontSize},\n\tCharacters = {\n`
		output += characters.join(",\n")
		output += `\n\t}\n}`
		
		return output
	}
})
