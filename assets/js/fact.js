const facts = ["RW Studio was established in 2019", "RW Studio was established with only 3 members", "Ethan love cat", "RW Studio first comic was The Last Words", "you can easily find help in the help center", "RW Studio was originally established for the sole purpose of making comic books", "RW Studio was called KSK Studio before we picked our name", "character on our TV show page named Karl Nason"];

!function newFact() {
  const randomFact = Math.floor(Math.random() * facts.length);
  document.getElementById('factDisplay').innerHTML = facts[randomFact];
}();