#!/usr/bin/env bash
algos=( DDL HDD HDD* GTR GTR* GTRX )

for f in tree-reducer/input/pdf/*
do
    if [[ $f == *.json ]]; then
        continue
    fi
    for a in "${algos[@]}"
    do
        node pdf-reducer.js -a $a -f "$(basename $f)"
    done
done