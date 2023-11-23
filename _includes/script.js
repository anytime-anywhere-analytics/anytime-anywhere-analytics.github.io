const copy = (recordId) => {
  var button = document.getElementById(`bibtex-button-${recordId}`);
  var content = document.getElementById(`bibtex-${recordId}`).textContent.trim();
  navigator.clipboard.writeText(content).then(() => {
    button.innerText = "✔ Copied BibTeX"
    setInterval(() => {
      button.innerText = "✚ Copy BibTeX"
    }, 1000)
  }).catch((err) => {
    console.error('Failed to copy: ', err);
  })
}
function toggleMenu() {
  var navbar = document.getElementById("navbar");
  if (navbar.style.display === "none" || navbar.style.display === "") {
    navbar.style.display = "flex";
  } else {
    navbar.style.display = "none";
  }
}
