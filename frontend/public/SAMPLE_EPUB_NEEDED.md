# Missing: public/sample.epub

`main.ts` loads `/sample.epub` to render the reader. That file isn't checked
into the repo (see `.gitignore`) and there is currently no file at
`frontend/public/sample.epub` on this machine.

The previous placeholder file used during development turned out to be a
pirated copy (it carried an "OceanofPDF.com" watermark page) and has been
removed. It should **not** be replaced with another pirated or otherwise
unlicensed copy.

To run the reader locally, add a legitimately-sourced Japanese EPUB at:

    frontend/public/sample.epub

A public-domain source (e.g. Aozora Bunko) or a book you've legally
purchased/licensed both work. The file stays gitignored regardless of its
license -- book content doesn't belong in this repo.

Delete this note once `sample.epub` is in place.
