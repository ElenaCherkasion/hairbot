import dotenv from "dotenv";
dotenv.config();

import express from "express";
import fetch from "node-fetch";
import pg from "pg";
import OpenAI from "openai";
import sharp from "sharp";
import PDFDocument from "pdfkit";
import FormData from "form-data";

const { Pool } = pg;

