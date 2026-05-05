--
-- PostgreSQL database dump
--

\restrict gxQHgkzPFIWSAhFC3cpRavUgBUOze3ONNWqKLrcbZWnyzqIvHfjqM2Jx2ObPn4X

-- Dumped from database version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.users VALUES (1, 'Abhijit Gaulkar', 'admin', 'Management', '9766339141', 'abhijit', '$2b$12$j1EAucbCniVn2IWIyy8Rk.alhznNQPIk4DIezGOPaAQdXP0FbLi7C', '2026-03-20 12:55:34.476721+00', 0.00);
INSERT INTO public.users VALUES (5, 'Ashwini Baitule', 'employee', 'Design', '8956772057', 'ashwini', '$2b$12$m6p0LdCyjuqceJdtniAQ5eoBs5DjB3W4tPi4XR4u7lJJ6mzoMNauK', '2026-03-27 10:06:12.790847+00', 15000.00);
INSERT INTO public.users VALUES (2, 'Chaitali Bawane', 'employee', 'Design Proposal', '8956772054', 'chaitali', '$2b$12$EkOvzAhOUrqg2.PUbh.NneU9jgdF9xIqyszdwrCJbzjcq24QaTjz.', '2026-03-20 12:55:34.767053+00', 20000.00);
INSERT INTO public.users VALUES (3, 'Rahul Kumar Bhiogade', 'employee', 'Execution', '8956772056', 'rahul', '$2b$12$wd2NKHi5gQiPhOG6G.ya/uHF.5ffqZuym2yp4bTjK4Yi8SQenptIC', '2026-03-20 12:55:35.055832+00', 30000.00);
INSERT INTO public.users VALUES (6, 'Sahil Vishwakarma', 'employee', 'Execution', '8956772058', 'sahil', '$2b$12$/o..fg9aifSdAps9x0vIhOEcyh75aHIevXkRUUsV.Jq..81tNP.UK', '2026-03-27 10:06:13.087777+00', 10000.00);


--
-- Data for Name: attendance; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.attendance VALUES (1, 2, '2026-03-27 14:10:02.976+00', '2026-03-27 14:10:09.191+00', 21.10748610, 79.05390130, '2026-03-27', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (2, 3, '2026-03-27 14:52:57.508+00', '2026-03-27 14:54:29.667+00', 21.10627387, 79.06640233, '2026-03-27', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (5, 2, '2026-03-28 11:58:42.632+00', NULL, 21.12797890, 79.07438050, '2026-03-28', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (4, 3, '2026-03-28 04:16:34.596+00', '2026-03-28 12:30:16.293+00', 21.10742150, 79.06277470, '2026-03-28', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (3, 1, '2026-03-28 03:52:39.959+00', '2026-03-28 13:35:23.274+00', NULL, NULL, '2026-03-28', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (8, 2, '2026-03-30 10:15:43.417+00', '2026-03-30 13:23:28.634+00', 21.10746320, 79.05319510, '2026-03-30', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (7, 3, '2026-03-30 07:15:50.252+00', '2026-03-30 14:30:02.169+00', 21.10739400, 79.06289900, '2026-03-30', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (6, 1, '2026-03-30 01:54:57.747+00', '2026-03-30 15:22:34.781+00', NULL, NULL, '2026-03-30', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (10, 3, '2026-03-31 05:42:15.659+00', NULL, 21.13632750, 79.08389070, '2026-03-31', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (11, 2, '2026-03-31 06:00:22.845+00', '2026-03-31 13:40:55.479+00', 21.10746320, 79.05319510, '2026-03-31', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (9, 1, '2026-03-31 04:29:41.884+00', '2026-03-31 17:22:06.887+00', 21.10740450, 79.06284320, '2026-03-31', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (12, 6, '2026-04-01 04:08:40.84+00', '2026-04-01 04:09:04.671+00', 21.15169670, 79.16592570, '2026-04-01', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (13, 5, '2026-04-01 04:41:54.425+00', NULL, 21.10740890, 79.06283270, '2026-04-01', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (14, 1, '2026-04-01 04:43:30.293+00', NULL, 21.10740120, 79.06285590, '2026-04-01', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (15, 3, '2026-04-01 05:13:19.337+00', '2026-04-01 13:30:19.32+00', 21.20185730, 79.08138200, '2026-04-01', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (16, 2, '2026-04-01 05:48:13.691+00', '2026-04-01 14:07:50.361+00', 21.10746320, 79.05319510, '2026-04-01', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (17, 5, '2026-04-02 04:30:38.392+00', '2026-04-02 13:03:37.897+00', 21.10744090, 79.06285890, '2026-04-02', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (19, 2, '2026-04-02 05:34:31.58+00', '2026-04-02 13:15:04.393+00', 21.10746320, 79.05319510, '2026-04-02', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (18, 1, '2026-04-02 04:41:34.426+00', '2026-04-02 14:27:44.501+00', 21.10741480, 79.06285380, '2026-04-02', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (20, 3, '2026-04-02 05:40:16.426+00', '2026-04-02 14:30:28.014+00', 21.10773020, 79.06287100, '2026-04-02', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (23, 2, '2026-04-03 06:03:44.136+00', '2026-04-03 12:03:39.406+00', 21.10746320, 79.05319510, '2026-04-03', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (22, 5, '2026-04-03 05:35:03.292+00', '2026-04-03 13:08:26.75+00', NULL, NULL, '2026-04-03', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (21, 1, '2026-04-03 04:18:41.482+00', '2026-04-03 13:24:53.624+00', 21.10742160, 79.06282680, '2026-04-03', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (24, 3, '2026-04-03 06:32:54.344+00', '2026-04-03 14:11:20.038+00', 21.12939450, 79.07640050, '2026-04-03', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (26, 5, '2026-04-04 04:33:02.946+00', '2026-04-04 13:00:28.093+00', 21.10750960, 79.06288750, '2026-04-04', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (27, 3, '2026-04-04 08:29:53.425+00', '2026-04-04 15:05:49.307+00', 21.10738420, 79.06297380, '2026-04-04', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (25, 1, '2026-04-04 04:18:32.926+00', '2026-04-04 16:12:36.172+00', 21.10840000, 79.04080000, '2026-04-04', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (28, 5, '2026-04-06 04:30:58.809+00', '2026-04-06 13:07:32.842+00', 21.10739850, 79.06295140, '2026-04-06', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (29, 3, '2026-04-06 06:06:35.88+00', '2026-04-06 16:47:49.828+00', 21.13631780, 79.08398680, '2026-04-06', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (31, 5, '2026-04-07 04:30:51.47+00', '2026-04-07 06:50:28.682+00', 21.10742960, 79.06290380, '2026-04-07', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (32, 2, '2026-04-07 05:48:40.498+00', '2026-04-07 13:55:12.019+00', 21.13211550, 79.07084990, '2026-04-07', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (33, 3, '2026-04-07 05:59:25.464+00', '2026-04-07 13:58:53.699+00', 21.20502960, 79.06727590, '2026-04-07', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (30, 1, '2026-04-07 04:15:39.873+00', '2026-04-07 14:25:50.013+00', 21.10740130, 79.06288060, '2026-04-07', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (35, 2, '2026-04-08 05:58:37.121+00', NULL, 21.10895120, 79.08285340, '2026-04-08', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (36, 1, '2026-04-08 10:10:43.821+00', NULL, 21.10840000, 79.04080000, '2026-04-08', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (34, 5, '2026-04-08 04:34:24.116+00', '2026-04-08 13:31:49.342+00', 21.10744320, 79.06293760, '2026-04-08', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (37, 3, '2026-04-08 14:10:29.754+00', '2026-04-08 14:55:42.649+00', 21.10775930, 79.06295820, '2026-04-08', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (40, 3, '2026-04-09 04:28:54.621+00', NULL, 21.20519350, 79.06623780, '2026-04-09', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (41, 2, '2026-04-09 05:45:09.265+00', NULL, 21.10895120, 79.08285340, '2026-04-09', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (39, 5, '2026-04-09 04:23:14.568+00', '2026-04-09 13:10:21.247+00', NULL, NULL, '2026-04-09', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (38, 1, '2026-04-09 04:14:02.785+00', '2026-04-09 18:27:38.13+00', 21.10747940, 79.06294650, '2026-04-09', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (43, 2, '2026-04-10 05:37:11.695+00', '2026-04-10 12:30:37.548+00', 21.10895120, 79.08285340, '2026-04-10', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (42, 5, '2026-04-10 04:32:11.184+00', '2026-04-10 12:56:59.825+00', 21.10740460, 79.06285000, '2026-04-10', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (44, 1, '2026-04-10 05:37:40.062+00', '2026-04-10 13:12:59.624+00', 21.10740360, 79.06293510, '2026-04-10', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (45, 3, '2026-04-10 06:08:01.616+00', '2026-04-10 13:22:26.547+00', 21.18306890, 79.03472550, '2026-04-10', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (46, 1, '2026-04-10 21:49:43.271+00', NULL, 21.10840000, 79.04080000, '2026-04-11', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (49, 2, '2026-04-11 10:40:01.427+00', NULL, 21.10746320, 79.05319510, '2026-04-11', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (47, 5, '2026-04-11 04:29:46.794+00', '2026-04-11 13:18:24.471+00', 21.10741410, 79.06296370, '2026-04-11', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (48, 3, '2026-04-11 05:54:57.342+00', '2026-04-11 13:45:24.061+00', 21.20189340, 79.08136570, '2026-04-11', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (51, 5, '2026-04-13 04:30:11.9+00', NULL, 21.10748130, 79.06286960, '2026-04-13', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (52, 2, '2026-04-13 05:44:40.722+00', '2026-04-13 13:45:20.022+00', 21.10746320, 79.05319510, '2026-04-13', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (53, 3, '2026-04-13 06:05:31.401+00', '2026-04-13 15:58:41.965+00', 21.10740010, 79.06294690, '2026-04-13', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (50, 1, '2026-04-13 02:51:41.803+00', '2026-04-13 16:14:08.361+00', 21.10741340, 79.06288370, '2026-04-13', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (54, 1, '2026-04-14 04:30:44.874+00', NULL, NULL, NULL, '2026-04-14', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (55, 2, '2026-04-14 05:26:04.708+00', NULL, 21.10893020, 79.07508660, '2026-04-14', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (57, 3, '2026-04-14 05:57:37.386+00', '2026-04-14 11:32:37.816+00', 21.20524370, 79.06634410, '2026-04-14', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (56, 5, '2026-04-14 05:28:35.265+00', '2026-04-14 13:22:38.587+00', 21.10840000, 79.04080000, '2026-04-14', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (58, 1, '2026-04-15 04:30:31.504+00', NULL, 21.10840000, 79.04080000, '2026-04-15', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (59, 5, '2026-04-15 04:31:13.239+00', '2026-04-15 13:15:22.619+00', 21.10840000, 79.04080000, '2026-04-15', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (60, 3, '2026-04-15 12:49:58.845+00', '2026-04-15 14:16:16.809+00', 21.10739030, 79.06297300, '2026-04-15', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (61, 1, '2026-04-16 00:31:00.1+00', NULL, 21.10840000, 79.04080000, '2026-04-16', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (63, 3, '2026-04-16 06:21:43.717+00', NULL, 21.14636770, 79.41711140, '2026-04-16', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (62, 5, '2026-04-16 05:03:05.808+00', '2026-04-16 12:55:39.626+00', 21.10840000, 79.04080000, '2026-04-16', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (64, 1, '2026-04-17 04:30:53.407+00', NULL, 21.10840000, 79.04080000, '2026-04-17', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (65, 5, '2026-04-17 04:30:55.23+00', NULL, 21.10840000, 79.04080000, '2026-04-17', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (66, 3, '2026-04-17 07:15:27.955+00', NULL, 21.23700680, 78.90481670, '2026-04-17', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (67, 2, '2026-04-17 08:35:28.014+00', '2026-04-17 13:52:48.437+00', 21.10893050, 79.07367440, '2026-04-17', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (69, 1, '2026-04-18 05:22:53.31+00', NULL, 16.85920000, 74.59430000, '2026-04-18', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (71, 2, '2026-04-18 12:25:30.081+00', '2026-04-18 13:05:32.471+00', 16.85920000, 74.59430000, '2026-04-18', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (68, 5, '2026-04-18 04:31:00.068+00', '2026-04-18 13:06:16.811+00', 16.85920000, 74.59430000, '2026-04-18', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (70, 3, '2026-04-18 05:38:38.718+00', '2026-04-18 13:17:13.043+00', 21.13633510, 79.08398110, '2026-04-18', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (73, 1, '2026-04-20 05:04:44.086+00', NULL, 16.85920000, 74.59430000, '2026-04-20', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (75, 3, '2026-04-20 06:00:29.729+00', NULL, 21.10737790, 79.06295540, '2026-04-20', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (72, 5, '2026-04-20 04:35:05.438+00', '2026-04-20 13:06:13.273+00', 16.85920000, 74.59430000, '2026-04-20', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (74, 2, '2026-04-20 05:13:40.113+00', '2026-04-20 14:31:48.709+00', 16.85920000, 74.59430000, '2026-04-20', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (76, 1, '2026-04-21 03:12:13.698+00', NULL, 21.14460000, 79.06760000, '2026-04-21', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (78, 3, '2026-04-21 05:28:14.62+00', NULL, 21.10741920, 79.06291550, '2026-04-21', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (79, 5, '2026-04-21 06:28:31.975+00', '2026-04-21 13:07:25.599+00', 21.14460000, 79.06760000, '2026-04-21', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (77, 2, '2026-04-21 05:02:52.388+00', '2026-04-21 13:30:57.352+00', 16.85920000, 74.59430000, '2026-04-21', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (80, 5, '2026-04-22 04:37:27.975+00', '2026-04-22 13:02:15.436+00', 20.66100000, 77.02890000, '2026-04-22', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (81, 3, '2026-04-22 13:52:30.821+00', '2026-04-22 13:53:06.984+00', 21.10775340, 79.06279240, '2026-04-22', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (82, 2, '2026-04-22 14:12:03.451+00', '2026-04-22 14:12:05.205+00', 20.66100000, 77.02890000, '2026-04-22', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (83, 1, '2026-04-23 04:32:43.391+00', NULL, 20.66100000, 77.02890000, '2026-04-23', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (84, 5, '2026-04-23 04:44:33.333+00', '2026-04-23 13:00:00.832+00', 20.66100000, 77.02890000, '2026-04-23', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (85, 3, '2026-04-23 06:15:23.949+00', '2026-04-23 14:36:33.102+00', 21.16671650, 79.07404430, '2026-04-23', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (88, 5, '2026-04-24 08:41:03.416+00', '2026-04-24 13:02:17.173+00', 20.66100000, 77.02890000, '2026-04-24', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (86, 3, '2026-04-24 07:24:35.197+00', '2026-04-24 13:29:09.737+00', 21.10744010, 79.06287290, '2026-04-24', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (87, 2, '2026-04-24 07:40:08.14+00', '2026-04-24 13:40:08.626+00', 20.66100000, 77.02890000, '2026-04-24', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (89, 2, '2026-04-25 05:38:43.79+00', '2026-04-25 11:05:28.866+00', 20.66100000, 77.02890000, '2026-04-25', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (90, 3, '2026-04-25 12:18:38.912+00', '2026-04-25 12:18:50.687+00', 21.20188450, 79.08136680, '2026-04-25', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (91, 1, '2026-04-27 04:28:40.255+00', NULL, 18.37670000, 76.63240000, '2026-04-27', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (92, 3, '2026-04-27 14:18:28.7+00', '2026-04-27 14:18:36.423+00', 21.14108180, 79.08025560, '2026-04-27', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (93, 1, '2026-04-28 04:33:48.057+00', NULL, 18.37670000, 76.63240000, '2026-04-28', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (94, 5, '2026-04-28 04:35:30.465+00', '2026-04-28 13:01:58.929+00', 18.37670000, 76.63240000, '2026-04-28', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (95, 3, '2026-04-28 12:54:02.253+00', '2026-04-28 13:49:21.348+00', 21.10744050, 79.06287340, '2026-04-28', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (98, 1, '2026-04-29 06:06:44.893+00', NULL, 18.37670000, 76.63240000, '2026-04-29', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (96, 5, '2026-04-29 04:38:08.964+00', '2026-04-29 13:02:05.656+00', 18.37670000, 76.63240000, '2026-04-29', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (97, 3, '2026-04-29 05:53:54.439+00', '2026-04-29 13:23:39.047+00', 21.10739570, 79.06303050, '2026-04-29', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (100, 1, '2026-04-30 07:25:02.202+00', NULL, 18.37670000, 76.63240000, '2026-04-30', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (99, 5, '2026-04-30 04:33:49.223+00', '2026-04-30 13:19:39.14+00', 18.37670000, 76.63240000, '2026-04-30', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (102, 1, '2026-05-01 04:40:19.784+00', NULL, 18.37670000, 76.63240000, '2026-05-01', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (104, 2, '2026-05-01 05:54:54.282+00', NULL, 18.37670000, 76.63240000, '2026-05-01', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (101, 5, '2026-05-01 04:30:43.674+00', '2026-05-01 13:03:04.294+00', 18.37670000, 76.63240000, '2026-05-01', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (103, 3, '2026-05-01 05:47:09.762+00', '2026-05-01 14:15:27.757+00', 21.10740570, 79.06294350, '2026-05-01', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (106, 5, '2026-05-02 04:40:02.176+00', '2026-05-02 11:58:32.625+00', 18.37670000, 76.63240000, '2026-05-02', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (107, 3, '2026-05-02 06:24:51.685+00', '2026-05-02 13:01:43.628+00', 21.10741850, 79.06292020, '2026-05-02', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (105, 1, '2026-05-02 01:09:54.478+00', '2026-05-02 16:20:47.945+00', 18.37670000, 76.63240000, '2026-05-02', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (108, 1, '2026-05-03 02:06:49.198+00', NULL, 21.10743380, 79.06282980, '2026-05-03', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (110, 2, '2026-05-04 05:44:07.354+00', '2026-05-04 13:53:47.615+00', 18.54590000, 77.57740000, '2026-05-04', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (111, 3, '2026-05-04 06:24:12.045+00', '2026-05-04 14:08:11.067+00', 21.10745770, 79.06285670, '2026-05-04', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (109, 1, '2026-05-04 02:45:00.7+00', '2026-05-04 15:37:36.71+00', 18.54590000, 77.57740000, '2026-05-04', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (112, 3, '2026-05-05 05:44:38.125+00', NULL, 21.18297240, 79.07888020, '2026-05-05', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.attendance VALUES (113, 2, '2026-05-05 07:18:12.195+00', NULL, 21.14460000, 79.06760000, '2026-05-05', 'present', false, 0, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, false);


--
-- Data for Name: leave_requests; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Name: attendance_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.attendance_id_seq', 114, true);


--
-- Name: leave_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.leave_requests_id_seq', 1, false);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 7, true);


--
-- PostgreSQL database dump complete
--

\unrestrict gxQHgkzPFIWSAhFC3cpRavUgBUOze3ONNWqKLrcbZWnyzqIvHfjqM2Jx2ObPn4X

