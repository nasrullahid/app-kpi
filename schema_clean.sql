--
-- PostgreSQL database dump
--

\restrict RBL6rQz1xTTGgwFaP738C6gilnZOkd71kQ1m3d1G0RFeLq1M53FEJbygvVha3lz

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: qualitative_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.qualitative_status AS ENUM (
    'not_started',
    'in_progress',
    'completed'
);


--
-- Name: target_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.target_type AS ENUM (
    'quantitative',
    'qualitative',
    'hybrid',
    'mou'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'pic'
);


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(NULLIF(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    COALESCE(NULLIF(new.raw_user_meta_data->>'role', ''), 'pic')::public.user_role
  );
  RETURN new;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: daily_inputs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_inputs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_id uuid NOT NULL,
    program_id uuid NOT NULL,
    date date NOT NULL,
    achievement_rp numeric,
    achievement_user integer,
    qualitative_status public.qualitative_status,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: daily_metric_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_metric_values (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_id uuid NOT NULL,
    program_id uuid NOT NULL,
    metric_definition_id uuid NOT NULL,
    date date NOT NULL,
    value numeric,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    target_value numeric
);


--
-- Name: COLUMN daily_metric_values.target_value; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.daily_metric_values.target_value IS 'Planned target for this metric on this specific date. Overrides pro-rata distribution of monthly_target.';


--
-- Name: milestone_completions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.milestone_completions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    milestone_id uuid NOT NULL,
    period_id uuid NOT NULL,
    is_completed boolean DEFAULT false,
    notes text,
    evidence_url text,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    month integer NOT NULL,
    year integer NOT NULL,
    working_days integer NOT NULL,
    is_active boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    is_locked boolean DEFAULT false,
    CONSTRAINT periods_month_check CHECK (((month >= 1) AND (month <= 12)))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    role public.user_role DEFAULT 'pic'::public.user_role,
    whatsapp_number text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: program_metric_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.program_metric_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    program_id uuid NOT NULL,
    metric_key text NOT NULL,
    label text NOT NULL,
    data_type text NOT NULL,
    input_type text NOT NULL,
    formula text,
    is_target_metric boolean DEFAULT false NOT NULL,
    monthly_target numeric,
    target_direction text DEFAULT 'higher_is_better'::text NOT NULL,
    unit_label text,
    show_on_dashboard boolean DEFAULT true NOT NULL,
    show_on_tv boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    metric_group text,
    is_primary boolean DEFAULT false NOT NULL,
    CONSTRAINT program_metric_definitions_data_type_check CHECK ((data_type = ANY (ARRAY['integer'::text, 'currency'::text, 'percentage'::text, 'float'::text, 'boolean'::text]))),
    CONSTRAINT program_metric_definitions_input_type_check CHECK ((input_type = ANY (ARRAY['manual'::text, 'calculated'::text]))),
    CONSTRAINT program_metric_definitions_target_direction_check CHECK ((target_direction = ANY (ARRAY['higher_is_better'::text, 'lower_is_better'::text])))
);


--
-- Name: program_milestones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.program_milestones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    program_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    "order" integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: program_pics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.program_pics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    program_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: programs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.programs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    pic_name text NOT NULL,
    pic_whatsapp text,
    target_type public.target_type DEFAULT 'quantitative'::public.target_type,
    monthly_target_rp numeric,
    monthly_target_user integer,
    qualitative_description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    daily_target_rp numeric,
    daily_target_user integer,
    pic_id uuid,
    department text DEFAULT 'general'::text NOT NULL,
    CONSTRAINT programs_department_check CHECK ((department = ANY (ARRAY['sales_marketing'::text, 'operations'::text, 'creative'::text, 'web_it'::text, 'general_affair'::text, 'customer_service'::text, 'hr'::text, 'general'::text])))
);


--
-- Name: daily_inputs daily_inputs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_inputs
    ADD CONSTRAINT daily_inputs_pkey PRIMARY KEY (id);


--
-- Name: daily_metric_values daily_metric_values_period_id_program_id_metric_definition__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_metric_values
    ADD CONSTRAINT daily_metric_values_period_id_program_id_metric_definition__key UNIQUE (period_id, program_id, metric_definition_id, date);


--
-- Name: daily_metric_values daily_metric_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_metric_values
    ADD CONSTRAINT daily_metric_values_pkey PRIMARY KEY (id);


--
-- Name: milestone_completions milestone_completions_milestone_id_period_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.milestone_completions
    ADD CONSTRAINT milestone_completions_milestone_id_period_id_key UNIQUE (milestone_id, period_id);


--
-- Name: milestone_completions milestone_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.milestone_completions
    ADD CONSTRAINT milestone_completions_pkey PRIMARY KEY (id);


--
-- Name: periods periods_month_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.periods
    ADD CONSTRAINT periods_month_year_key UNIQUE (month, year);


--
-- Name: periods periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.periods
    ADD CONSTRAINT periods_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: program_metric_definitions program_metric_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_metric_definitions
    ADD CONSTRAINT program_metric_definitions_pkey PRIMARY KEY (id);


--
-- Name: program_metric_definitions program_metric_definitions_program_id_metric_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_metric_definitions
    ADD CONSTRAINT program_metric_definitions_program_id_metric_key_key UNIQUE (program_id, metric_key);


--
-- Name: program_milestones program_milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_milestones
    ADD CONSTRAINT program_milestones_pkey PRIMARY KEY (id);


--
-- Name: program_pics program_pics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_pics
    ADD CONSTRAINT program_pics_pkey PRIMARY KEY (id);


--
-- Name: program_pics program_pics_program_id_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_pics
    ADD CONSTRAINT program_pics_program_id_profile_id_key UNIQUE (program_id, profile_id);


--
-- Name: programs programs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programs
    ADD CONSTRAINT programs_pkey PRIMARY KEY (id);


--
-- Name: idx_dmv_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dmv_date ON public.daily_metric_values USING btree (date);


--
-- Name: idx_dmv_period_program; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dmv_period_program ON public.daily_metric_values USING btree (period_id, program_id);


--
-- Name: idx_milestone_completions_milestone_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_milestone_completions_milestone_id ON public.milestone_completions USING btree (milestone_id);


--
-- Name: idx_pmd_program_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pmd_program_id ON public.program_metric_definitions USING btree (program_id);


--
-- Name: idx_program_milestones_program_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_milestones_program_id ON public.program_milestones USING btree (program_id);


--
-- Name: idx_program_pics_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_pics_profile_id ON public.program_pics USING btree (profile_id);


--
-- Name: idx_program_pics_program_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_pics_program_id ON public.program_pics USING btree (program_id);


--
-- Name: daily_inputs daily_inputs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_inputs
    ADD CONSTRAINT daily_inputs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: daily_inputs daily_inputs_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_inputs
    ADD CONSTRAINT daily_inputs_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.periods(id) ON DELETE CASCADE;


--
-- Name: daily_inputs daily_inputs_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_inputs
    ADD CONSTRAINT daily_inputs_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE;


--
-- Name: daily_metric_values daily_metric_values_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_metric_values
    ADD CONSTRAINT daily_metric_values_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: daily_metric_values daily_metric_values_metric_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_metric_values
    ADD CONSTRAINT daily_metric_values_metric_definition_id_fkey FOREIGN KEY (metric_definition_id) REFERENCES public.program_metric_definitions(id) ON DELETE CASCADE;


--
-- Name: daily_metric_values daily_metric_values_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_metric_values
    ADD CONSTRAINT daily_metric_values_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.periods(id) ON DELETE CASCADE;


--
-- Name: daily_metric_values daily_metric_values_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_metric_values
    ADD CONSTRAINT daily_metric_values_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE;


--
-- Name: milestone_completions milestone_completions_milestone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.milestone_completions
    ADD CONSTRAINT milestone_completions_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES public.program_milestones(id) ON DELETE CASCADE;


--
-- Name: milestone_completions milestone_completions_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.milestone_completions
    ADD CONSTRAINT milestone_completions_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.periods(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: program_metric_definitions program_metric_definitions_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_metric_definitions
    ADD CONSTRAINT program_metric_definitions_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE;


--
-- Name: program_milestones program_milestones_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_milestones
    ADD CONSTRAINT program_milestones_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE;


--
-- Name: program_pics program_pics_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_pics
    ADD CONSTRAINT program_pics_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: program_pics program_pics_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_pics
    ADD CONSTRAINT program_pics_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE;


--
-- Name: programs programs_pic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programs
    ADD CONSTRAINT programs_pic_id_fkey FOREIGN KEY (pic_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: daily_metric_values Admin can delete daily metric values; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can delete daily metric values" ON public.daily_metric_values FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));


--
-- Name: program_metric_definitions Admin can delete metric definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can delete metric definitions" ON public.program_metric_definitions FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));


--
-- Name: milestone_completions Admin can do anything on milestones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can do anything on milestones" ON public.milestone_completions TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));


--
-- Name: program_milestones Admin can do anything on program_milestones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can do anything on program_milestones" ON public.program_milestones TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));


--
-- Name: program_pics Admin can do anything on program_pics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can do anything on program_pics" ON public.program_pics TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));


--
-- Name: daily_metric_values Admin can insert daily metric values; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can insert daily metric values" ON public.daily_metric_values FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));


--
-- Name: program_metric_definitions Admin can insert metric definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can insert metric definitions" ON public.program_metric_definitions FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));


--
-- Name: daily_metric_values Admin can read all daily metric values; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can read all daily metric values" ON public.daily_metric_values FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));


--
-- Name: daily_metric_values Admin can update daily metric values; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can update daily metric values" ON public.daily_metric_values FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));


--
-- Name: program_metric_definitions Admin can update metric definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can update metric definitions" ON public.program_metric_definitions FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));


--
-- Name: daily_inputs Admins can do anything on daily inputs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can do anything on daily inputs" ON public.daily_inputs USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));


--
-- Name: periods Admins can do anything on periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can do anything on periods" ON public.periods USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));


--
-- Name: programs Admins can do anything on programs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can do anything on programs" ON public.programs USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));


--
-- Name: program_milestones Authenticated can read active milestones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can read active milestones" ON public.program_milestones FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))) OR (EXISTS ( SELECT 1
   FROM public.programs
  WHERE ((programs.id = program_milestones.program_id) AND (programs.is_active = true))))));


--
-- Name: program_metric_definitions Authenticated can read metric definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can read metric definitions" ON public.program_metric_definitions FOR SELECT TO authenticated USING (true);


--
-- Name: profiles Authenticated users can read all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read all profiles" ON public.profiles FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: daily_inputs Everyone can read daily inputs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Everyone can read daily inputs" ON public.daily_inputs FOR SELECT USING (true);


--
-- Name: periods Everyone can read periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Everyone can read periods" ON public.periods FOR SELECT USING (true);


--
-- Name: daily_metric_values PIC can insert own program metric values; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "PIC can insert own program metric values" ON public.daily_metric_values FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.program_pics
  WHERE ((program_pics.program_id = daily_metric_values.program_id) AND (program_pics.profile_id = auth.uid())))));


--
-- Name: milestone_completions PIC can read assigned milestone completions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "PIC can read assigned milestone completions" ON public.milestone_completions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.program_milestones pm
     JOIN public.program_pics pp ON ((pp.program_id = pm.program_id)))
  WHERE ((pm.id = milestone_completions.milestone_id) AND (pp.profile_id = auth.uid())))));


--
-- Name: program_pics PIC can read own assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "PIC can read own assignments" ON public.program_pics FOR SELECT TO authenticated USING ((profile_id = auth.uid()));


--
-- Name: daily_metric_values PIC can read own program metric values; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "PIC can read own program metric values" ON public.daily_metric_values FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.program_pics
  WHERE ((program_pics.program_id = daily_metric_values.program_id) AND (program_pics.profile_id = auth.uid())))));


--
-- Name: daily_metric_values PIC can update own program metric values; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "PIC can update own program metric values" ON public.daily_metric_values FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.program_pics
  WHERE ((program_pics.program_id = daily_metric_values.program_id) AND (program_pics.profile_id = auth.uid())))));


--
-- Name: milestone_completions PIC can upsert assigned milestone completions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "PIC can upsert assigned milestone completions" ON public.milestone_completions FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.program_milestones pm
     JOIN public.program_pics pp ON ((pp.program_id = pm.program_id)))
  WHERE ((pm.id = milestone_completions.milestone_id) AND (pp.profile_id = auth.uid())))));


--
-- Name: daily_inputs PICs can insert own program inputs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "PICs can insert own program inputs" ON public.daily_inputs FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))) OR (EXISTS ( SELECT 1
   FROM public.program_pics
  WHERE ((program_pics.program_id = daily_inputs.program_id) AND (program_pics.profile_id = auth.uid()))))));


--
-- Name: programs PICs can read assigned programs only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "PICs can read assigned programs only" ON public.programs FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))) OR (EXISTS ( SELECT 1
   FROM public.program_pics
  WHERE ((program_pics.program_id = programs.id) AND (program_pics.profile_id = auth.uid()))))));


--
-- Name: daily_inputs PICs can update own program inputs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "PICs can update own program inputs" ON public.daily_inputs FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))) OR ((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.program_pics
  WHERE ((program_pics.program_id = daily_inputs.program_id) AND (program_pics.profile_id = auth.uid())))))));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: daily_inputs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_inputs ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_metric_values; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_metric_values ENABLE ROW LEVEL SECURITY;

--
-- Name: milestone_completions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.milestone_completions ENABLE ROW LEVEL SECURITY;

--
-- Name: periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.periods ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: program_metric_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.program_metric_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: program_milestones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.program_milestones ENABLE ROW LEVEL SECURITY;

--
-- Name: program_pics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.program_pics ENABLE ROW LEVEL SECURITY;

--
-- Name: programs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict RBL6rQz1xTTGgwFaP738C6gilnZOkd71kQ1m3d1G0RFeLq1M53FEJbygvVha3lz

