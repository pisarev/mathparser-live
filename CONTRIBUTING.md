# Contributing

Thanks for taking the time. One person maintains this, so the process is short.

## Reporting a problem

Open an issue. What helps:

- the address of the page and what you clicked;
- the formula, if the demo computed something wrong;
- the browser and its version. The demo runs the parser as WebAssembly, and
  browsers differ in what they allow it to do.

## Sending a change

This is a static site: pages, styles and one WebAssembly build of the parser.
The parser itself lives in pascal-mathparser - a fix to the computing belongs
there, not here.

- keep one change about one thing;
- the pages have no build step and no framework; plain HTML, CSS and JavaScript
  are the house style here;
- say in the pull request which browsers you opened the page in.

## Terms

By opening a pull request you agree that your contribution is licensed to
the project owner under the MIT licence, and that the owner may relicense
the project, including your contribution, under different terms in the
future.

You keep the copyright to what you wrote. This is a licence grant, not a
transfer: it exists so the project can change its licence later without
tracking down everyone who ever sent a patch.
