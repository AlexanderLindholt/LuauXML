document.addEventListener("DOMContentLoaded", () => {
	const fileInput = document.getElementById("xmlFile")
	const fileNameElement = document.getElementById("xmlFileName")
	
	const outputArea = document.getElementById("outputArea")
	const outputCodeElement = document.getElementById("outputCode")
	const copyButton = document.getElementById("copyButton")
	
	const statusElement = document.getElementById("status")
	
	fileInput.addEventListener("change", handleFileSelect)
	copyButton.addEventListener("click", copyToClipboard)
	
	function handleFileSelect(event) {
		clearStatus()
		outputArea.style.display = "none"
		
		const file = event.target.files[0]
		if (!file) return
		
		fileNameElement.textContent = file.name
		fileNameElement.title = file.name
		fileNameElement.style = "color: var(--text-color);"
		
		const allowedExtensions = /(\.xml|\.fnt|\.txt)$/i
		if (!allowedExtensions.exec(file.name)) {
			showStatus(`Invalid file type. Select .xml, .fnt, or .txt.`, "error")
			fileInput.value = ""
			return
		}
		
		const reader = new FileReader()
		
		reader.onload = function(e) {
			try {
				const xmlContent = e.target.result
				const output = convertXMLToLua(xmlContent)
				
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
		
		const extractInteger = (elementString, attribute) => {
			const match = elementString.match(new RegExp(`${attribute}\\s*=\\s*"(-?\\d+)"`))
			return match ? parseInt(match[1], 10) : null
		}
		
		let fontSize = null
		const infoMatch = xml.match(/<info([^>]+)>/)
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
		
		const characters = []
		const charRegex = /<char([^>]+)\/>/g
		let match = null
		
		while ((match = charRegex.exec(xml)) !== null) {
			const attributes = match[1]
			
			const id = extractInteger(attributes, "id")
			if (id !== null && !isNaN(id)) {
				const width = extractInteger(attributes, "width")
				const height = extractInteger(attributes, "height")
				const x = extractInteger(attributes, "x")
				const y = extractInteger(attributes, "y")
				const xOffset = extractInteger(attributes, "xoffset")
				const yOffset = extractInteger(attributes, "yoffset")
				const xAdvance = extractInteger(attributes, "xadvance")
				
				if ([width, height, x, y, xOffset, yOffset, xAdvance].some(val => val === null || isNaN(val))) {
					return `Character data for ${id} is missing or invalid.`
				}
				
				const char = String.fromCharCode(id)
				const escapedChar = char.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")
				
				characters.push(
					`\t\t["${escapedChar}"] = {${width}, ${height}, Vector2.new(${x}, ${y}), ${xOffset}, ${yOffset}, ${xAdvance}}`
				)
			} else {
				return `Found <char> tag with missing or invalid "id" attribute:\n${match[0]}}`
			}
		}
		
		if (characters.length === 0 && xml.includes("<chars") && xml.includes("count=")) {
			const charsCountMatch = xml.match(/<chars\s+count="(\d+)"/)
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
	
	function copyToClipboard() {
		if (!outputCodeElement.textContent) return
		
		navigator.clipboard.writeText(outputCodeElement.textContent)
			.then(() => {
				const buttonText = copyButton.querySelector("span")
				const originalText = buttonText.textContent
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
	}
	
	function resetCopyButton() {
		const buttonText = copyButton.querySelector("span")
		buttonText.textContent = "Copy"
		copyButton.disabled = false
	}
	
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
})
