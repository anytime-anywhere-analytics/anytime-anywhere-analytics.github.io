const copy = (recordId) =>  {
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
// Sticky section headers
var stickyHeaders = (function() {
    var stickies;
    var load = function(stickiesSelector) {
      stickies = document.querySelectorAll(stickiesSelector);
      if (stickies.length > 0) {
        Array.from(stickies).forEach(function(sticky) {
          var wrapper = document.createElement('div');
          wrapper.className = 'followWrap';
          sticky.parentNode.insertBefore(wrapper, sticky);
          wrapper.appendChild(sticky);
  
          sticky.originalPosition = sticky.offsetTop;
          sticky.originalHeight = sticky.offsetHeight;
          wrapper.style.height = sticky.offsetHeight + 'px';
        });
        window.removeEventListener("scroll", _whenScrolling);
        window.addEventListener("scroll", _whenScrolling);
      }
    };
    var _whenScrolling = function() {
      Array.from(stickies).forEach(function(sticky, i) {
        var stickyPosition = sticky.originalPosition;
        if (stickyPosition <= window.scrollY) {
          sticky.classList.add("fixed");
          sticky.style.color = "white";
          sticky.style.zIndex = 1000;
          sticky.style.fontSize = "0.8rem";
          sticky.style.padding = "0.25rem";
          sticky.style.paddingLeft = "1rem";
          sticky.style.paddingBottom = "0.4rem";
          sticky.style.backgroundColor = "#0273A8";
          var nextSticky = stickies[i + 1];
          if (nextSticky) {
            var nextStickyPosition = nextSticky.originalPosition - sticky.originalHeight;
            if (sticky.offsetTop >= nextStickyPosition) {
              sticky.classList.add("absolute");
              sticky.style.top = nextStickyPosition + 'px';
            }
          }
        } else {
          sticky.classList.remove("fixed");
          sticky.style.color = "black";
          sticky.style.zIndex = -1000;
          sticky.style.fontSize = "1.2rem";
          sticky.style.padding = "0px";
          sticky.style.backgroundColor = "transparent";
          var prevSticky = stickies[i - 1];
          if (prevSticky && window.scrollY <= sticky.originalPosition - sticky.originalHeight) {
            prevSticky.classList.remove("absolute");
            prevSticky.style.removeProperty('top');
          }
        }
      });
    };
    return {
      load: load
    };
  })();
  document.addEventListener('DOMContentLoaded', function() {
    stickyHeaders.load(".sticky-header");
  });
  